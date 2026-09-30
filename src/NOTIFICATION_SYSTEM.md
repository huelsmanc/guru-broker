# Real-Time Notification System

## Overview
A comprehensive real-time notification system that alerts users when they:
- Receive a mention (@name or @channel) in chat
- Get a reply in a message thread
- New events are added to the culture calendar

## Architecture

### Backend Components

#### 1. **Notification Entity** (`entities/Notification.json`)
Extended with new notification types:
- `mention` - User was mentioned in chat
- `thread_reply` - New reply in a thread they're participating in
- `calendar_event` - New event added to culture calendar

#### 2. **Backend Functions**

**`notifyOnMention.js`**
- Triggered when a message with @mentions is sent in SocialChat
- Resolves @channel to all users or finds specific users by name/email
- Creates notification records for all mentioned users

**`notifyOnThreadReply.js`**
- Triggered when someone replies in a message thread
- Notifies original message sender and all previous thread participants
- Excludes the replier themselves

**`notifyOnCalendarEvent.js`**
- Triggered when admin adds a new event to the culture calendar
- Notifies all brokerage users about the new event
- Includes event title, date, and creator info

### Frontend Components

#### 1. **NotificationManager** (`components/notifications/NotificationManager.jsx`)
- Polls unread notifications every 3 seconds
- Subscribes to real-time notification events
- Auto-dismisses toasts after 6 seconds
- Marks notifications as read when user clicks them
- Navigates to relevant page based on notification type

#### 2. **NotificationToast** (`components/notifications/NotificationToast.jsx`)
- Beautiful toast UI with icons based on notification type
- Click to navigate to related content
- Dismiss button for manual dismissal
- Smooth animations (slide in/out)

### Integration Points

#### SocialChat (`pages/SocialChat`)
- Detects @mentions in messages and calls `notifyOnMention`
- Thread replies trigger `notifyOnThreadReply` via MessageThread component

#### CultureCalendar (`pages/CultureCalendar`)
- Creating new events triggers `notifyOnCalendarEvent`

#### AppLayout (`components/layout/AppLayout`)
- NotificationManager instance runs in the global layout
- All authenticated users see notifications across all pages

## User Flow

1. **Mention Notification**
   - User types @name or @channel in chat
   - Message is sent with mention list
   - `notifyOnMention` backend function creates notifications
   - Toast appears to mentioned users in real-time
   - Click toast navigates to chat channel

2. **Thread Reply Notification**
   - User replies in a message thread
   - `notifyOnThreadReply` backend function identifies who to notify
   - Original sender and all thread participants get notifications
   - Click navigates to chat with thread highlighted

3. **Calendar Event Notification**
   - Admin creates new event in Culture Calendar
   - `notifyOnCalendarEvent` notifies all brokerage users
   - Click navigates to Culture Calendar page

## Notification Lifecycle

1. **Creation** - Backend function creates notification record
2. **Display** - NotificationManager detects via real-time subscription or polling
3. **Toast** - NotificationToast component displays beautiful toast
4. **Interaction** - User clicks (navigate) or dismisses (mark as read)
5. **Persistence** - Read status persists in database

## Technical Details

- **Real-time Updates**: Uses Base44 real-time subscription API
- **Fallback Polling**: 3-second polling for browsers without subscription support
- **Auto-dismiss**: Toasts auto-dismiss after 6 seconds
- **Mobile Friendly**: Positioned fixed, responsive, accessible
- **Performance**: Only fetches unread notifications
- **Scalability**: Uses bulk creation for calendar events (all users)

## Future Enhancements

- Push notifications for mobile apps
- Email notifications for important events
- Notification preferences/settings per user
- Notification history page
- Sound/vibration alerts
- Notification batching for high-volume events