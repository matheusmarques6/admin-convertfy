import { GoogleCalendarEvent, GoogleCalendarList } from "./types"
import { fetchWithRetry } from "@/lib/utils/retry"

const CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3"

export interface GoogleCalendarConfig {
  accessToken: string
  refreshToken?: string
  calendarId?: string
}

export class GoogleCalendarService {
  private accessToken: string
  private refreshToken?: string
  private calendarId: string

  constructor(config: GoogleCalendarConfig) {
    this.accessToken = config.accessToken
    this.refreshToken = config.refreshToken
    this.calendarId = config.calendarId || "primary"
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetchWithRetry(`${CALENDAR_API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        error.error?.message || `Google Calendar API error: ${response.status}`
      )
    }

    // 204 No Content — no body to parse (e.g. DELETE)
    if (response.status === 204) return null as T

    return response.json()
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getCalendarList()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      }
    }
  }

  // Calendar Lists
  async getCalendarList(): Promise<GoogleCalendarList[]> {
    const response = await this.request<{ items: GoogleCalendarList[] }>(
      "/users/me/calendarList"
    )
    return response.items
  }

  async getCalendar(calendarId?: string): Promise<GoogleCalendarList> {
    const id = calendarId || this.calendarId
    return this.request(`/calendars/${encodeURIComponent(id)}`)
  }

  // Events
  async createEvent(
    event: GoogleCalendarEvent,
    options?: {
      sendUpdates?: "all" | "externalOnly" | "none"
      conferenceDataVersion?: 0 | 1
    }
  ): Promise<GoogleCalendarEvent & { id: string; htmlLink: string }> {
    const queryParams = new URLSearchParams()
    if (options?.sendUpdates) {
      queryParams.set("sendUpdates", options.sendUpdates)
    }
    if (options?.conferenceDataVersion !== undefined) {
      queryParams.set("conferenceDataVersion", options.conferenceDataVersion.toString())
    }

    const query = queryParams.toString()
    const endpoint = `/calendars/${encodeURIComponent(this.calendarId)}/events${query ? `?${query}` : ""}`

    return this.request(endpoint, {
      method: "POST",
      body: JSON.stringify(event),
    })
  }

  async getEvent(eventId: string): Promise<GoogleCalendarEvent & { id: string; htmlLink: string }> {
    return this.request(
      `/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`
    )
  }

  async updateEvent(
    eventId: string,
    event: Partial<GoogleCalendarEvent>,
    options?: { sendUpdates?: "all" | "externalOnly" | "none" }
  ): Promise<GoogleCalendarEvent & { id: string }> {
    const queryParams = new URLSearchParams()
    if (options?.sendUpdates) {
      queryParams.set("sendUpdates", options.sendUpdates)
    }

    const query = queryParams.toString()
    const endpoint = `/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}${query ? `?${query}` : ""}`

    return this.request(endpoint, {
      method: "PATCH",
      body: JSON.stringify(event),
    })
  }

  async deleteEvent(
    eventId: string,
    options?: { sendUpdates?: "all" | "externalOnly" | "none" }
  ): Promise<void> {
    const queryParams = new URLSearchParams()
    if (options?.sendUpdates) {
      queryParams.set("sendUpdates", options.sendUpdates)
    }

    const query = queryParams.toString()
    const endpoint = `/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}${query ? `?${query}` : ""}`

    await this.request(endpoint, { method: "DELETE" })
  }

  async listEvents(params?: {
    timeMin?: string
    timeMax?: string
    maxResults?: number
    singleEvents?: boolean
    orderBy?: "startTime" | "updated"
    q?: string
  }): Promise<Array<GoogleCalendarEvent & { id: string; htmlLink: string }>> {
    const queryParams = new URLSearchParams()
    if (params?.timeMin) queryParams.set("timeMin", params.timeMin)
    if (params?.timeMax) queryParams.set("timeMax", params.timeMax)
    if (params?.maxResults) queryParams.set("maxResults", params.maxResults.toString())
    if (params?.singleEvents !== undefined) queryParams.set("singleEvents", params.singleEvents.toString())
    if (params?.orderBy) queryParams.set("orderBy", params.orderBy)
    if (params?.q) queryParams.set("q", params.q)

    const query = queryParams.toString()
    const endpoint = `/calendars/${encodeURIComponent(this.calendarId)}/events${query ? `?${query}` : ""}`

    const response = await this.request<{
      items: Array<GoogleCalendarEvent & { id: string; htmlLink: string }>
    }>(endpoint)
    return response.items || []
  }

  /**
   * List incremental para o sync bidirecional (Google -> admin).
   *
   * - Com syncToken: retorna apenas o delta desde o ultimo sync (inclui
   *   eventos cancelados, status='cancelled').
   * - Sem syncToken: full sync na janela informada; a ultima pagina traz
   *   nextSyncToken.
   * - HTTP 410 (syncToken vencido): retorna expired=true; o chamador deve
   *   refazer um full sync.
   */
  async listEventsForSync(params: {
    syncToken?: string
    timeMin?: string
    timeMax?: string
    maxResults?: number
    pageToken?: string
  }): Promise<{
    items: Array<GoogleCalendarEvent & { id: string }>
    nextSyncToken?: string
    nextPageToken?: string
    expired?: boolean
  }> {
    const qp = new URLSearchParams()
    qp.set("singleEvents", "true")
    if (params.syncToken) {
      qp.set("syncToken", params.syncToken)
    } else {
      if (params.timeMin) qp.set("timeMin", params.timeMin)
      if (params.timeMax) qp.set("timeMax", params.timeMax)
      qp.set("showDeleted", "false")
    }
    if (params.maxResults) qp.set("maxResults", params.maxResults.toString())
    if (params.pageToken) qp.set("pageToken", params.pageToken)

    const endpoint = `/calendars/${encodeURIComponent(this.calendarId)}/events?${qp.toString()}`
    const response = await fetchWithRetry(`${CALENDAR_API_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    // syncToken vencido -> chamador refaz full sync
    if (response.status === 410) {
      return { items: [], expired: true }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        error.error?.message || `Google Calendar API error: ${response.status}`
      )
    }

    const data = await response.json()
    return {
      items: data.items || [],
      nextSyncToken: data.nextSyncToken,
      nextPageToken: data.nextPageToken,
    }
  }

  // Create event with Google Meet
  async createEventWithMeet(
    event: Omit<GoogleCalendarEvent, "conferenceData">
  ): Promise<GoogleCalendarEvent & { id: string; htmlLink: string; meetLink?: string }> {
    const eventWithConference: GoogleCalendarEvent = {
      ...event,
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }

    const result = await this.createEvent(eventWithConference, {
      conferenceDataVersion: 1,
      sendUpdates: "all",
    })

    const meetLink = result.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video"
    )?.uri

    return { ...result, meetLink }
  }

  // Helper: Create a meeting for a client
  async createClientMeeting(params: {
    title: string
    description?: string
    startTime: Date
    durationMinutes: number
    attendeeEmails: string[]
    withMeet?: boolean
  }): Promise<{
    eventId: string
    htmlLink: string
    meetLink?: string
  }> {
    const endTime = new Date(params.startTime)
    endTime.setMinutes(endTime.getMinutes() + params.durationMinutes)

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

    const event: GoogleCalendarEvent = {
      summary: params.title,
      description: params.description,
      start: {
        dateTime: params.startTime.toISOString(),
        timeZone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone,
      },
      attendees: params.attendeeEmails.map((email) => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 15 },
        ],
      },
    }

    if (params.withMeet) {
      const result = await this.createEventWithMeet(event)
      return {
        eventId: result.id,
        htmlLink: result.htmlLink,
        meetLink: result.meetLink,
      }
    }

    const result = await this.createEvent(event, { sendUpdates: "all" })
    return {
      eventId: result.id,
      htmlLink: result.htmlLink,
    }
  }

  // Get upcoming events for dashboard
  async getUpcomingEvents(
    daysAhead: number = 7
  ): Promise<
    Array<{
      id: string
      title: string
      start: Date
      end: Date
      attendees: string[]
      meetLink?: string
      htmlLink: string
    }>
  > {
    const now = new Date()
    const future = new Date()
    future.setDate(future.getDate() + daysAhead)

    const events = await this.listEvents({
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20,
    })

    return events.map((event) => ({
      id: event.id,
      title: event.summary,
      start: new Date(event.start.dateTime),
      end: new Date(event.end.dateTime),
      attendees: event.attendees?.map((a) => a.email) || [],
      meetLink: event.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === "video"
      )?.uri,
      htmlLink: event.htmlLink,
    }))
  }
}

// Factory function
export function createGoogleCalendarService(
  credentials: Record<string, string>
): GoogleCalendarService {
  if (!credentials.access_token) {
    throw new Error("Google Access Token is required")
  }

  return new GoogleCalendarService({
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token,
    calendarId: credentials.calendar_id,
  })
}
