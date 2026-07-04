interface FakturowniaTurnoverReportRequest {
  from?: string;
  to?: string;
  departmentId?: string;
}

interface FakturowniaTurnoverReportResponse {
  from: string;
  to: string;
  fileName: string;
  contentType: string;
  data: string;
}

export async function generateFakturowniaTurnoverReport(
  data: FakturowniaTurnoverReportRequest,
): Promise<FakturowniaTurnoverReportResponse> {
  try {
    const response = await fetch("/api/fakturownia/reports/turnover", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as FakturowniaTurnoverReportResponse;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

interface FakturowniaUnpaidReportRequest {
  from?: string;
  to?: string;
  departmentId?: string;
}

interface FakturowniaUnpaidReportResponse {
  from: string;
  to: string;
  fileName: string;
  contentType: string;
  data: string;
}

export async function generateFakturowniaUnpaidReport(
  data: FakturowniaUnpaidReportRequest,
): Promise<FakturowniaUnpaidReportResponse> {
  try {
    const response = await fetch("/api/fakturownia/reports/unpaid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as FakturowniaUnpaidReportResponse;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
