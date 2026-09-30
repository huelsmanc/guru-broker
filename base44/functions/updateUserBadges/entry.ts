import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { brokerage_id, user_email } = await req.json();

    if (!brokerage_id || !user_email) {
      return Response.json({ error: 'Missing brokerage_id or user_email' }, { status: 400 });
    }

    // Fetch all recognitions for this user
    const recognitions = await base44.asServiceRole.entities.Recognition.filter({
      to_email: user_email,
      brokerage_id: brokerage_id,
    });

    // Fetch social messages mentioning this user (thank you notes sent by them)
    const socialMessages = await base44.asServiceRole.entities.SocialMessage.filter({
      sender_email: user_email,
      brokerage_id: brokerage_id,
    });

    // Get existing badges
    const existingBadges = await base44.asServiceRole.entities.UserBadge.filter({
      user_email: user_email,
      brokerage_id: brokerage_id,
    });

    const existingBadgeIds = new Set(existingBadges.map(b => b.badge_id));
    const newBadges = [];

    // Badge logic
    const badgeConfig = {
      team_player: {
        name: 'Team Player',
        icon: '🤝',
        threshold: 5,
        condition: () => recognitions.length >= 5,
        description: 'Recognized by teammates 5+ times'
      },
      culture_champion: {
        name: 'Culture Champion',
        icon: '🎯',
        threshold: 10,
        condition: () => recognitions.length >= 10,
        description: 'Recognized by teammates 10+ times'
      },
      recognition_leader: {
        name: 'Recognition Leader',
        icon: '⭐',
        threshold: 15,
        condition: () => recognitions.length >= 15,
        description: 'Recognized by teammates 15+ times'
      },
      kindness_ambassador: {
        name: 'Kindness Ambassador',
        icon: '💝',
        threshold: 5,
        condition: () => socialMessages.length >= 5,
        description: 'Shared 5+ thank you notes'
      },
      milestone_celebrator: {
        name: 'Milestone Celebrator',
        icon: '🎉',
        threshold: 1,
        condition: () => {
          const events = base44.asServiceRole.entities.CultureCalendarEntry.filter({
            brokerage_id: brokerage_id,
          }).then(events => {
            return events.some(e => e.created_by_email === user_email);
          });
          return events;
        },
        description: 'Celebrated team milestones'
      },
      superstar: {
        name: 'Superstar',
        icon: '⚡',
        threshold: 20,
        condition: () => recognitions.length >= 20,
        description: 'Recognized by teammates 20+ times'
      },
    };

    // Check each badge condition
    for (const [badgeId, config] of Object.entries(badgeConfig)) {
      if (!existingBadgeIds.has(badgeId)) {
        const earnedBadge = await config.condition();
        if (earnedBadge || (typeof config.condition === 'function' && config.condition())) {
          newBadges.push({
            brokerage_id: brokerage_id,
            user_email: user_email,
            user_name: (await base44.asServiceRole.entities.User.filter({ email: user_email }))[0]?.full_name || user_email,
            badge_id: badgeId,
            badge_name: config.name,
            badge_icon: config.icon,
            earned_date: new Date().toISOString(),
            description: config.description,
          });
        }
      }
    }

    // Create new badges
    if (newBadges.length > 0) {
      await base44.asServiceRole.entities.UserBadge.bulkCreate(newBadges);
    }

    return Response.json({
      success: true,
      newBadgesEarned: newBadges.length,
      badges: newBadges,
    });
  } catch (error) {
    console.error('Error updating user badges:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});