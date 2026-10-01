import React from 'react';
import { localDay } from '@/lib/dates';
import { MapPin, Clock, Users, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const EVENT_TYPE_EMOJI = {
  party: '🎉',
  training: '📚',
  outing: '🚗',
  meeting: '👥',
  celebration: '🎊',
  other: '📅',
};

export default function EventCard({ event, stats, onRSVP, onAttendance, isAdmin, userRSVP }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/30 transition-colors h-full flex flex-col">
      {event.image_url && (
        <img src={event.image_url} alt={event.title} className="w-full h-40 object-cover" />
      )}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{EVENT_TYPE_EMOJI[event.type]}</span>
            <Badge variant="secondary" className="text-xs capitalize">{event.type}</Badge>
          </div>
        </div>
        <h3 className="font-semibold text-foreground text-lg mb-3">{event.title}</h3>
        
        {event.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{event.description}</p>
        )}

        <div className="space-y-2 mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{format(localDay(event.date), 'MMM d, yyyy')} at {event.time}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            <span>{event.location}</span>
          </div>
          {event.duration_minutes && (
            <div className="text-xs">Duration: {Math.floor(event.duration_minutes / 60)}h {event.duration_minutes % 60}m</div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
          <div className="text-center">
            <p className="font-bold text-foreground">{stats.attending}</p>
            <p className="text-xs text-muted-foreground">attending</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-foreground">{stats.maybe}</p>
            <p className="text-xs text-muted-foreground">maybe</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-foreground">{stats.notAttending}</p>
            <p className="text-xs text-muted-foreground">no</p>
          </div>
        </div>

        <div className="flex gap-2 mt-auto">
          <Button
            onClick={onRSVP}
            variant={userRSVP?.status === 'attending' ? 'default' : 'outline'}
            className="flex-1 rounded-lg h-9 text-sm"
          >
            {userRSVP?.status === 'attending' ? (
              <>
                <CheckCircle className="w-4 h-4 mr-1" /> Attending
              </>
            ) : (
              'RSVP'
            )}
          </Button>
          {isAdmin && (
            <Button onClick={onAttendance} variant="ghost" className="rounded-lg h-9" title="Track attendance">
              <Users className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}