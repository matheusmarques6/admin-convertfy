import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  trackViaYunExpress,
  getYunExpressSender,
  trackViaYunExpressLastMile,
  type YunExpressCredentials,
} from "../yunexpress"

const CREDS: YunExpressCredentials = { customerNumber: "CUST001", apiKey: "test-key-123" }

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe("trackViaYunExpress", () => {
  it("returns TrackingResult on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Code: 0,
        Message: "Success",
        Data: {
          WaybillNumber: "YT2024030700001234",
          TrackingNumber: "YT2024030700001234",
          Status: "InTransit",
          ReceiverCountry: "BR",
          SenderCountry: "CN",
          CreatedOn: "2024-03-07T10:00:00Z",
        },
      }),
    })

    const result = await trackViaYunExpress("YT2024030700001234", CREDS)

    expect(result).not.toBeNull()
    expect(result!.tracking_number).toBe("YT2024030700001234")
    expect(result!.carrier_code).toBe("yunexpress")
    expect(result!.carrier_name).toBe("YunExpress")
    expect(result!.status).toBe("in_transit")
  })

  it("sends correct Authorization header (Basic base64)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Code: 0, Data: null }),
    })

    await trackViaYunExpress("YT0000000000000000", CREDS)

    const expectedAuth = `Basic ${Buffer.from("CUST001:test-key-123").toString("base64")}`
    expect(mockFetch).toHaveBeenCalledOnce()
    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[1].headers.Authorization).toBe(expectedAuth)
  })

  it("returns null when API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

    const result = await trackViaYunExpress("YT0000000000000000", CREDS)
    expect(result).toBeNull()
  })

  it("returns null when Data is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Code: 0, Data: null }),
    })

    const result = await trackViaYunExpress("YT0000000000000000", CREDS)
    expect(result).toBeNull()
  })

  it("returns null on timeout (AbortError)", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("Aborted"), { name: "AbortError" }))

    const result = await trackViaYunExpress("YT0000000000000000", CREDS)
    expect(result).toBeNull()
  })

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    const result = await trackViaYunExpress("YT0000000000000000", CREDS)
    expect(result).toBeNull()
  })

  it("maps Delivered status correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Code: 0,
        Data: { WaybillNumber: "YT001", Status: "Delivered", CreatedOn: "2024-01-01" },
      }),
    })

    const result = await trackViaYunExpress("YT001", CREDS)
    expect(result!.status).toBe("delivered")
  })

  it("maps Exception status correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Code: 0,
        Data: { WaybillNumber: "YT001", Status: "Exception", CreatedOn: "2024-01-01" },
      }),
    })

    const result = await trackViaYunExpress("YT001", CREDS)
    expect(result!.status).toBe("exception")
  })

  it("handles special characters in credentials for base64", async () => {
    const specialCreds: YunExpressCredentials = { customerNumber: "user@123", apiKey: "p@ss:word!" }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Code: 0, Data: null }),
    })

    await trackViaYunExpress("YT0000000000000000", specialCreds)

    const expectedAuth = `Basic ${Buffer.from("user@123:p@ss:word!").toString("base64")}`
    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[1].headers.Authorization).toBe(expectedAuth)
  })
})

describe("getYunExpressSender", () => {
  it("returns sender info on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Code: 0,
        Data: {
          SenderName: "John Doe",
          SenderCompany: "Test Corp",
          SenderAddress: "123 Main St",
          SenderCity: "Shenzhen",
          SenderState: "Guangdong",
          SenderCountry: "CN",
          SenderPhone: "+8612345678",
          SenderEmail: "john@test.com",
        },
      }),
    })

    const result = await getYunExpressSender("YT001", CREDS)
    expect(result).not.toBeNull()
    expect(result!.name).toBe("John Doe")
    expect(result!.company).toBe("Test Corp")
    expect(result!.country).toBe("CN")
  })

  it("returns null when Data is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Code: 0, Data: null }),
    })

    const result = await getYunExpressSender("YT001", CREDS)
    expect(result).toBeNull()
  })

  it("returns null on error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const result = await getYunExpressSender("YT001", CREDS)
    expect(result).toBeNull()
  })
})

describe("trackViaYunExpressLastMile", () => {
  it("returns results for batch request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Code: 0,
        Data: [
          {
            WaybillNumber: "YT001",
            TrackingNumber: "YT001",
            DeliveryStatus: "Delivered",
            LastMileCarrier: "Correios",
            LastMileTrackingNumber: "BR001",
            TrackingEvents: [
              { ProcessDate: "2024-03-07T10:00:00Z", ProcessContent: "Delivered", ProcessLocation: "Sao Paulo" },
              { ProcessDate: "2024-03-06T08:00:00Z", ProcessContent: "In Transit", ProcessLocation: "Shanghai" },
            ],
          },
          {
            WaybillNumber: "YT002",
            DeliveryStatus: "InTransit",
            TrackingEvents: [],
          },
        ],
      }),
    })

    const results = await trackViaYunExpressLastMile(["YT001", "YT002"], CREDS)

    expect(results).toHaveLength(2)
    expect(results[0].tracking_number).toBe("YT001")
    expect(results[0].status).toBe("delivered")
    expect(results[0].carrier_name).toBe("Correios")
    expect(results[0].events).toHaveLength(2)
    expect(results[0].events[0].description).toBe("Delivered")

    expect(results[1].tracking_number).toBe("YT002")
    expect(results[1].status).toBe("in_transit")
  })

  it("returns empty array for empty input", async () => {
    const results = await trackViaYunExpressLastMile([], CREDS)
    expect(results).toHaveLength(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("truncates to 20 when given more than 20 numbers", async () => {
    const numbers = Array.from({ length: 25 }, (_, i) => `YT${String(i).padStart(16, "0")}`)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Code: 0, Data: [] }),
    })

    await trackViaYunExpressLastMile(numbers, CREDS)

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sentBody).toHaveLength(20)
  })

  it("returns empty array on error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const results = await trackViaYunExpressLastMile(["YT001"], CREDS)
    expect(results).toHaveLength(0)
  })

  it("returns empty array on timeout", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("Aborted"), { name: "AbortError" }))

    const results = await trackViaYunExpressLastMile(["YT001"], CREDS)
    expect(results).toHaveLength(0)
  })

  it("sorts events by date descending", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Code: 0,
        Data: [{
          WaybillNumber: "YT001",
          DeliveryStatus: "InTransit",
          TrackingEvents: [
            { ProcessDate: "2024-03-05T08:00:00Z", ProcessContent: "First" },
            { ProcessDate: "2024-03-07T08:00:00Z", ProcessContent: "Last" },
            { ProcessDate: "2024-03-06T08:00:00Z", ProcessContent: "Middle" },
          ],
        }],
      }),
    })

    const results = await trackViaYunExpressLastMile(["YT001"], CREDS)
    expect(results[0].events[0].description).toBe("Last")
    expect(results[0].events[1].description).toBe("Middle")
    expect(results[0].events[2].description).toBe("First")
  })
})
