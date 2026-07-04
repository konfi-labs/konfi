import { includes, replace } from "es-toolkit/compat";

export function formatMailLink(url: string): string {
  try {
    if (includes(url, "outlook.office.com")) {
      let formattedUrl = replace(url, /\.office\./g, ".office365.");
      formattedUrl = replace(
        formattedUrl,
        /\/mail\/inbox\/id\//g,
        "/owa/?ItemID=",
      );
      return `${formattedUrl}&exvsurl=1&viewmodel=ReadMessageItem`;
    } else {
      return url;
    }
  } catch (error) {
    console.error("Error formatting mail link:", error);
    return url; // Return the original URL if an error occurs
  }
}
