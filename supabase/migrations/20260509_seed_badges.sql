-- ============================================================================
-- Seed 25 total badges (adds 19 new badges to the original 6)
-- Run AFTER the main migration
-- ============================================================================

INSERT INTO public.badges (id, name, emoji, description, criteria_type, criteria_value) VALUES
  -- Streak badges
  ('streak_3',       'Warming Up',      '🌡️', 'Achieve a 3-day streak',                    'streak_days',        3),
  ('streak_14',      'Two Weeks Strong', '💎', 'Achieve a 14-day streak',                   'streak_days',        14),
  ('streak_30',      'Monthly Master',  '🏆', 'Achieve a 30-day streak',                    'streak_days',        30),
  ('streak_100',     'Unstoppable',     '🔱', '100-day streak — you are a legend',           'streak_days',        100),

  -- Completion badges
  ('first_one',      'First Steps',     '👶', 'Complete your very first challenge',          'completions',        1),
  ('ten_done',       'Getting Started', '🎯', 'Complete 10 challenges',                      'completions',        10),
  ('fifty_done',     'Halfway Hero',    '⭐', 'Complete 50 challenges',                      'completions',        50),
  ('two_fifty',      'Dedicated',       '🎖️', 'Complete 250 challenges',                    'completions',        250),
  ('five_hundred',   'Legendary',       '👑', 'Complete 500 challenges',                     'completions',        500),

  -- XP badges
  ('xp_1000',        'Rising Star',     '⬆️', 'Earn 1,000 total XP',                       'total_xp',           1000),
  ('xp_5000',        'XP Machine',      '🚀', 'Earn 5,000 total XP',                       'total_xp',           5000),
  ('xp_10000',       'XP Legend',       '💫', 'Earn 10,000 total XP',                       'total_xp',           10000),

  -- Social/reaction badges
  ('first_react',    'Supportive',      '👍', 'Give your first reaction',                   'reactions_given',    1),
  ('react_100',      'Cheerleader',     '📣', 'Give 100 reactions',                          'reactions_given',    100),
  ('beloved_100',    'Popular',         '💕', 'Receive 100 total reactions',                 'reactions_received', 100),
  ('beloved_500',    'Fan Favorite',    '🌟', 'Receive 500 total reactions',                 'reactions_received', 500),

  -- Poll badges
  ('poll_10',        'Opinion Haver',   '🗳️', 'Vote in 10 polls',                          'poll_votes',         10),
  ('poll_100',       'Poll Addict',     '📊', 'Vote in 100 polls',                          'poll_votes',         100),

  -- Friends badges
  ('social_1',       'Connected',       '🤝', 'Make your first friend',                     'friends_count',      1),
  ('social_10',      'Social Butterfly','🦋', 'Have 10 friends',                             'friends_count',      10),
  ('social_50',      'Influencer',      '📢', 'Have 50 friends',                             'friends_count',      50),

  -- Level badges
  ('level_5',        'Leveling Up',     '🎮', 'Reach level 5',                               'level_reached',      5),
  ('level_10',       'Max Level',       '🏅', 'Reach level 10',                              'level_reached',      10)
ON CONFLICT (id) DO NOTHING;
