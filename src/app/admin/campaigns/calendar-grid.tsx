import { Mail } from "lucide-react"
import { Campaign } from "@/types"
import { CHANNEL_CONFIG, WEEK_DAYS } from "@/lib/constants/calendar"

/**
 * Re-export for any admin consumers that imported channelConfig from here.
 * Uses shared CHANNEL_CONFIG from calendar constants.
 */
export const channelConfig = CHANNEL_CONFIG

interface CalendarGridProps {
  daysInMonth: number
  startingDayOfWeek: number
  getCampaignsForDay: (day: number) => Campaign[]
  isDayToday: (day: number) => boolean
  onDayClick: (day: number) => void
  onCampaignClick: (campaign: Campaign, e: React.MouseEvent) => void
}

export function CalendarGrid({
  daysInMonth,
  startingDayOfWeek,
  getCampaignsForDay,
  isDayToday,
  onDayClick,
  onCampaignClick,
}: CalendarGridProps) {
  return (
    <>
      {/* Week days header */}
      <div className="grid grid-cols-7 border-b">
        {WEEK_DAYS.map((day) => (
          <div
            key={day}
            className="p-2 text-center text-sm font-medium text-muted-foreground border-r last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {/* Empty cells */}
        {Array.from({ length: startingDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="h-32 border border-border/50 bg-muted/20" />
        ))}

        {/* Days */}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dayCampaigns = getCampaignsForDay(day)
          const dayIsToday = isDayToday(day)

          return (
            <div
              key={day}
              onClick={() => onDayClick(day)}
              className={`
                h-32 border border-border/50 p-1 cursor-pointer transition-colors
                hover:bg-muted/50
                ${dayIsToday ? "bg-primary/5 border-primary/30" : ""}
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`
                    text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full
                    ${dayIsToday ? "bg-primary text-primary-foreground" : ""}
                  `}
                >
                  {day}
                </span>
                {dayCampaigns.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{dayCampaigns.length - 3}
                  </span>
                )}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayCampaigns.slice(0, 3).map((campaign) => {
                  const ChannelIcon = channelConfig[campaign.channel]?.icon || Mail
                  return (
                    <div
                      key={campaign.id}
                      onClick={(e) => onCampaignClick(campaign, e)}
                      className="text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1 text-white cursor-pointer hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: campaign.color || "#3b82f6" }}
                      title={campaign.name}
                    >
                      <ChannelIcon className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{campaign.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
