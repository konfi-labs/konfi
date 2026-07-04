# Requires PowerShell 3.0 or later for Invoke-RestMethod

#region Configuration
# Your Meilisearch instance URL (default is http://localhost:7700)
$meilisearchUrl = "http://localhost:7700"

# The UID of the index you want to update (e.g., "products")
$indexUid = "products"

# Your Meilisearch master key (if required for your instance)
# If you don't have a master key configured, you can leave this as an empty string.
$masterKey = "" # Or, e.g., "mySuperSecretMasterKey"

# The attribute to add to filterableAttributes
$newFilterableAttribute = "recommended"

#endregion

#region .env File Loading
# Path to the .env file. Assumes it's in the same directory as the script.
$envFilePath = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "../../../.env"

if (Test-Path $envFilePath) {
  Write-Host "Loading environment variables from '$envFilePath'..."
  Get-Content $envFilePath | ForEach-Object {
    # Ignore empty lines and lines starting with # (comments)
    if (-not [string]::IsNullOrWhiteSpace($_) -and -not $_.TrimStart().StartsWith("#")) {
      # Split line into key and value at the first '='
      $parts = $_.Split('=', 2)
      if ($parts.Length -eq 2) {
        $key = $parts[0].Trim()
        $value = $parts[1].Trim().Trim("""'") # Trim whitespace and quotes (single or double)

        # For this script's purpose, we'll assign directly to our script variables
        switch ($key) {
          "MEILISEARCH_HOST" { $meilisearchUrl = $value; Write-Host "  MEILISEARCH_HOST loaded." }
          "MEILISEARCH_API_KEY" { $masterKey = $value; Write-Host "  MEILISEARCH_API_KEY loaded." }
          default { Write-Host "  Ignoring unknown .env variable: $key" }
        }
      }
    }
  }
}
else {
  Write-Warning "'.env' file not found at '$envFilePath'. Using default configuration."
}
#endregion

#region Script Logic

Write-Host "Attempting to update Meilisearch index '$indexUid' settings..."
Write-Host "Using Meilisearch URL: '$meilisearchUrl'"

# Construct the URL for the filterable attributes endpoint specifically
$filterableAttributesUrl = "$($meilisearchUrl)/indexes/$($indexUid)/settings/filterable-attributes"

# Define the headers
$headers = @{
  "Content-Type" = "application/json"
}

# Add Authorization header if a master key is provided
if (-not [string]::IsNullOrEmpty($masterKey)) {
  $headers.Add("Authorization", "Bearer $($masterKey)")
  Write-Host "Using master key for authentication."
}
else {
  Write-Host "No master key provided (or it's empty). Proceeding without authentication header."
}

try {
  # First, get the current filterable attributes
  Write-Host "Fetching current filterable attributes for index '$indexUid' from '$filterableAttributesUrl'..."
  $existingFilterableAttributes = Invoke-RestMethod -Uri $filterableAttributesUrl -Method GET -Headers $headers -ErrorAction Stop

  # Ensure it's always treated as an array
  $existingFilterableAttributes = @($existingFilterableAttributes)
  if (-not $existingFilterableAttributes) {
    $existingFilterableAttributes = @()
  }
  Write-Host "Current filterable attributes found: $($existingFilterableAttributes -join ', ')"

  # Create the new list of filterable attributes, ensuring uniqueness
  $filteredAttributes = $existingFilterableAttributes | Where-Object { $_ -ne $newFilterableAttribute }
  
  # Create a new array with the filtered attributes plus the new one
  $updatedFilterableAttributes = @()
  $updatedFilterableAttributes += $filteredAttributes
  $updatedFilterableAttributes += $newFilterableAttribute

  Write-Host "Attempting to set filterable attributes to: $($updatedFilterableAttributes -join ', ')"

  # Convert directly to JSON array (not wrapped in an object)
  $body = $updatedFilterableAttributes | ConvertTo-Json -Compress

  Write-Host "Sending PUT request to update filterable attributes to '$filterableAttributesUrl'..."
  Write-Host "Payload being sent: $($body)"

  # Send the PUT request to the specific endpoint
  $response = Invoke-RestMethod -Uri $filterableAttributesUrl -Method PUT -Headers $headers -Body $body

  Write-Host "`nSuccessfully updated filterable attributes for index '$indexUid'."
  Write-Host "Response from Meilisearch:"
  $response | Format-List

}
catch {
  Write-Error "Failed to update Meilisearch settings: $($_.Exception.Message)"
  if ($_.Exception.InnerException) {
    Write-Error "Detailed Inner Error: $($_.Exception.InnerException.Message)"
  }
  Write-Error "Check your Meilisearch URL, API key, index UID, and ensure Meilisearch is running."
  Write-Error "Also ensure that the '$indexUid' index actually exists in Meilisearch."
}

#endregion