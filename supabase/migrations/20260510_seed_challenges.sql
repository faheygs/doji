-- ============================================================================
-- Seed 400 challenges: 100 photo, 100 questions, 100 poll, 100 would-you-rather
-- Safe to re-run: deletes all existing challenges first
-- ============================================================================

BEGIN;

-- Guard: skip if challenges already exist (safe for production re-runs)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.challenges LIMIT 1) THEN
    RAISE NOTICE 'Challenges already seeded — skipping.';
    RETURN;
  END IF;
END $$;

-- ===================== 100 PHOTO CHALLENGES (everyone photographs the same thing, compare) =====================
INSERT INTO public.challenges (title, description, type, category, difficulty, xp_reward, requires_photo, requires_video, requires_text, is_active, participant_count) VALUES
('Photo something blue', 'Find the nearest blue thing and photograph it.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something red', 'Find the closest red object around you and snap it.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something green', 'Spot the nearest green thing in your surroundings.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something yellow', 'Find anything yellow near you and capture it.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something white', 'Find the nearest white object. Snap it.', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Photo something round', 'Find a round object near you and photograph it.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something shiny', 'Find the shiniest thing near you and capture it.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo something soft', 'Find the softest thing within reach and snap it.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something tiny', 'Find the smallest object you can see right now.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo something old', 'Find the oldest-looking thing in your view.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something new', 'Find something that looks brand new near you.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something with a pattern', 'Stripes, dots, plaid — find a pattern near you.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Snap the sky', 'Point your camera straight up. What does the sky look like?', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Snap the floor', 'Look down. What are you standing or sitting on? Photo it.', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Snap the ceiling', 'Look up. What''s above you right now?', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Snap your shoes', 'Whatever is on your feet right now. Show us.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Snap your hands', 'What are your hands doing right now? Photo them.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Snap your drink', 'Coffee, water, soda — whatever is nearest. Snap it.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Snap your view', 'Whatever is directly in front of you right now.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Snap your reflection', 'Find a reflective surface — window, screen, mirror. Photo it.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Snap the nearest door', 'Open or closed — what does it look like?', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Snap the nearest window', 'Show us the closest window from where you are.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Snap the nearest light source', 'Lamp, screen glow, overhead light — capture what''s lighting your space.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Snap your left hand', 'Whatever your left hand is doing right now.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Snap the closest book', 'Any book or magazine near you. Show the cover.', 'photo', 'mental', 1, 25, true, false, false, true, 0),
('Snap something you use every day', 'Phone, pen, cup — an everyday object.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Snap the nearest plant', 'Any greenery near you, real or fake.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Snap a texture', 'Wood, fabric, metal — find an interesting texture up close.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Snap something colorful', 'Find the most vibrant color in your surroundings.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Snap something cozy', 'Find the coziest-looking thing near you and photo it.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Show your current setup', 'Where are you right now? Desk, couch, bed, outside? Full scene.', 'photo', 'social', 1, 30, true, false, false, true, 0),
('Show your phone case', 'Flip your phone around and show us the case (or lack of one).', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Show your keys', 'Wherever your keys are right now. Snap them.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Show your watch or clock', 'What time is it for you right now? Photo it.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Show your bag or backpack', 'Whatever you carry stuff in. Show the outside.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Photo the closest screen', 'Phone, laptop, TV, tablet — what''s on the nearest screen?', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Photo the nearest chair', 'Find the closest chair or seat. What does it look like?', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Photo something square', 'Find a square-shaped object near you.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something transparent', 'Glass, plastic, water — find something see-through.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo something metal', 'Find the nearest metal object and snap it.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something wooden', 'Find wood near you — furniture, floor, anything.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something with text on it', 'A sign, label, book, package — anything with words.', 'photo', 'mental', 1, 25, true, false, false, true, 0),
('Photo something with numbers on it', 'Clock, receipt, page number — find numbers near you.', 'photo', 'mental', 1, 25, true, false, false, true, 0),
('Photo something handmade', 'Find anything near you that looks handmade or DIY.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo your shadow', 'If you can see your shadow, snap it.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo something orange', 'Find the nearest orange object around you.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something purple', 'Spot anything purple near you.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something pink', 'Find the nearest pink thing in your area.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something black', 'Find a black object near you and snap it.', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Photo something with a logo', 'Find a brand logo on anything near you.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Photo the most interesting thing near you', 'Look around. What catches your eye? Snap it.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo the most boring thing near you', 'Find the most mundane, ordinary object in sight.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo the oldest thing near you', 'What''s the most worn, vintage, or aged item in view?', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo the brightest thing near you', 'Find the brightest color or light source.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something fluffy', 'Pillow, pet, towel — find something fluffy.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo your socks', 'Show us what''s on your feet (or not). Socks check!', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo your snack', 'Whatever food or snack is nearest you right now.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Photo the wall nearest you', 'What does the closest wall look like? Paint, poster, blank?', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Photo a corner of your room', 'Pick any corner. What''s there?', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo your charging cable', 'Show us the cord keeping your devices alive.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo the nearest trash can', 'What does the closest bin look like? Snap it.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo your favorite thing in the room', 'What do you love most that you can see right now?', 'photo', 'mental', 1, 30, true, false, false, true, 0),
('Photo the most colorful thing near you', 'Find the item with the most colors on it.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo something striped', 'Find stripes on anything — clothes, objects, surfaces.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo the biggest thing near you', 'What is the largest object in your immediate space?', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo the nearest cup or mug', 'Coffee mug, water glass, tumbler — show us.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo something with buttons', 'Remote, keyboard, shirt — find buttons.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo the nearest piece of paper', 'Note, receipt, book page — show the nearest paper.', 'photo', 'mental', 1, 20, true, false, false, true, 0),
('Photo your pillow or cushion', 'Show us what you rest your head or back on.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo the nearest food packaging', 'Any wrapper, box, or container near you.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo something with a face on it', 'Emoji, drawing, product mascot — find a face.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo a cord or cable', 'Phone charger, headphones, extension cord — snap a cable.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo your shirt or top', 'What are you wearing right now? Show the pattern or color.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Photo something that smells good', 'Candle, coffee, food, lotion — snap something fragrant.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo the nearest electronics', 'Phone, laptop, remote, speaker — snap a gadget.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Photo a sticker or label', 'Find any sticker, tag, or label near you.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo your nails', 'Show us your fingernails right now. Painted or plain?', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo something comfortable', 'Blanket, hoodie, chair — what''s the comfiest thing near you?', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo the nearest handle', 'Door handle, drawer pull, mug handle — find one.', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Photo something twisted or tangled', 'Headphones, cables, hair — find a tangle.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something upside down', 'Flip any object upside down and photograph it.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo the nearest art or decoration', 'Poster, painting, photo frame — find wall art.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo a pair of something', 'Shoes, earbuds, socks — find a matching pair.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something plastic', 'Find the nearest plastic item and snap it.', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Photo something you''d grab in a fire', 'The one object near you you''d save — snap it.', 'photo', 'mental', 1, 35, true, false, false, true, 0),
('Photo something that makes you happy', 'What object near you brings you joy?', 'photo', 'mental', 1, 30, true, false, false, true, 0),
('Photo the messiest spot near you', 'No tidying — show the chaos.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Photo the cleanest spot near you', 'Find the tidiest area in your view.', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Photo your water bottle', 'Show us your hydration situation right now.', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo the nearest zipper', 'Bag, jacket, cushion cover — find a zipper.', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Photo something cold', 'Find the coldest-feeling thing near you and snap it.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo something warm', 'Find something warm — a mug, a sunlit spot, a blanket.', 'photo', 'creative', 1, 25, true, false, false, true, 0),
('Photo the nearest switch or button', 'Light switch, power button, elevator button — find one.', 'photo', 'creative', 1, 20, true, false, false, true, 0),
('Photo your headphones or earbuds', 'Show us how you listen to music (or that you don''t have any).', 'photo', 'social', 1, 25, true, false, false, true, 0),
('Photo something nostalgic near you', 'Find an object that reminds you of the past.', 'photo', 'mental', 1, 35, true, false, false, true, 0),
('Photo the nearest writing tool', 'Pen, pencil, marker, stylus — find one.', 'photo', 'mental', 1, 20, true, false, false, true, 0),
('Photo something from nature', 'Even indoors — a plant, a stone, a shell, a feather.', 'photo', 'creative', 1, 30, true, false, false, true, 0),
('Photo the nearest clock', 'Analog, digital, microwave, wall — what time does it show?', 'photo', 'social', 1, 20, true, false, false, true, 0),
('Photo something you''d give away', 'An object near you that you wouldn''t mind parting with.', 'photo', 'mental', 1, 25, true, false, false, true, 0),
('Snap a selfie right now', 'No filter, no prep. Just you in this moment.', 'photo', 'social', 1, 30, true, false, false, true, 0);

-- ===================== 100 TEXT QUESTIONS (type your answer, no photo) =====================
INSERT INTO public.challenges (title, description, type, category, difficulty, xp_reward, requires_photo, requires_video, requires_text, is_active, participant_count) VALUES
('What''s your favorite color?', 'Simple but revealing. Tell us your go-to color.', 'task', 'social', 1, 15, false, false, true, true, 0),
('What song is stuck in your head?', 'Name the song (or hum the lyrics if you don''t know the title).', 'task', 'creative', 1, 20, false, false, true, true, 0),
('Describe your mood in 3 words', 'Right now, in this moment — 3 words only.', 'task', 'mental', 1, 20, false, false, true, true, 0),
('What''s the last thing you ate?', 'Be honest. No judgment.', 'task', 'social', 1, 15, false, false, true, true, 0),
('What''s your go-to comfort food?', 'The one thing that always hits.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s your favorite movie?', 'All-time, no second-guessing. Name it.', 'task', 'creative', 1, 20, false, false, true, true, 0),
('What''s the last show you binged?', 'What kept you up way too late?', 'task', 'social', 1, 20, false, false, true, true, 0),
('If you could have any superpower, what would it be?', 'Flying, invisibility, time travel — pick one.', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your dream vacation destination?', 'Money is no object. Where are you going?', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s the best compliment you''ve ever received?', 'The one that stuck with you.', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What''s your favorite time of day?', 'Morning, afternoon, evening, or late night?', 'task', 'mental', 1, 15, false, false, true, true, 0),
('What makes you laugh the most?', 'A person, a show, a type of humor — spill it.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s your hidden talent?', 'Something most people don''t know about you.', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your favorite season and why?', 'Spring, summer, fall, winter — defend your choice.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s the best advice you''ve ever gotten?', 'Words that actually changed something for you.', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What were you doing one hour ago?', 'Think back. What was going on?', 'task', 'social', 1, 15, false, false, true, true, 0),
('What''s the first app you open in the morning?', 'Be honest — what do you reach for?', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s your favorite word?', 'A word you just love saying or hearing.', 'task', 'creative', 1, 20, false, false, true, true, 0),
('What would you name a pet rock?', 'Get creative. This matters.', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your go-to karaoke song?', 'Even if you''d never actually do karaoke.', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s the last thing that made you smile?', 'Today or recently — what was it?', 'task', 'mental', 1, 20, false, false, true, true, 0),
('What''s your unpopular food opinion?', 'Pineapple on pizza? Ketchup on eggs? Go for it.', 'task', 'social', 1, 25, false, false, true, true, 0),
('If you could eat one meal forever, what would it be?', 'Breakfast, lunch, or dinner — one meal, forever.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s your favorite childhood memory?', 'Something that still makes you feel warm.', 'task', 'mental', 1, 30, false, false, true, true, 0),
('What''s the weirdest thing in your fridge?', 'We all have that one mystery item.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s your morning routine in 5 words?', 'Alarm, coffee, panic, run, repeat? Describe yours.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What emoji do you use the most?', 'Check your recently used if you need to.', 'task', 'social', 1, 15, false, false, true, true, 0),
('What''s your favorite smell?', 'Coffee, rain, fresh cookies — what scent do you love?', 'task', 'creative', 1, 20, false, false, true, true, 0),
('What would you do with an extra hour today?', 'You just got gifted 60 bonus minutes.', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What''s your favorite thing about yourself?', 'Brag a little. You deserve it.', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What''s the last thing you searched on Google?', 'No deleting history first. Just tell us.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What are you looking forward to this week?', 'Big or small — what''s coming up?', 'task', 'mental', 1, 20, false, false, true, true, 0),
('What''s your favorite holiday and why?', 'Christmas, Halloween, your birthday — pick one.', 'task', 'social', 1, 20, false, false, true, true, 0),
('If you were a pizza topping, what would you be?', 'Explain your reasoning.', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your current phone wallpaper?', 'Describe it without showing it.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s a skill you wish you had?', 'Cooking, coding, singing — what''s on your wishlist?', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What was the last nice thing you did for someone?', 'Acts of kindness, big or small.', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s your most-used catchphrase?', 'What do your friends hear you say all the time?', 'task', 'social', 1, 20, false, false, true, true, 0),
('Describe your ideal lazy day', 'No responsibilities. What does it look like?', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What''s a random fact you know?', 'Drop some knowledge on us.', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What''s the best thing that happened today?', 'Find the highlight, even if it''s small.', 'task', 'mental', 1, 20, false, false, true, true, 0),
('If you had a theme song, what would it be?', 'What plays when you walk into a room?', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your favorite ice cream flavor?', 'Classic question, important answers.', 'task', 'social', 1, 15, false, false, true, true, 0),
('What''s the last book you read (or started)?', 'Title and whether you finished it.', 'task', 'mental', 1, 20, false, false, true, true, 0),
('What would you rename yourself?', 'If you could pick any name, what would it be?', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your love language?', 'Words, touch, gifts, time, acts of service — which one?', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s the most overrated thing?', 'Something everyone loves that you just don''t get.', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s the most underrated thing?', 'Something amazing that nobody talks about enough.', 'task', 'social', 1, 25, false, false, true, true, 0),
('What do you think about before falling asleep?', 'That last thought before you drift off.', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What''s your go-to snack?', 'The one you always reach for.', 'task', 'social', 1, 15, false, false, true, true, 0),
('If your life was a movie genre, what would it be?', 'Comedy? Drama? Action? Documentary?', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your favorite thing about weekends?', 'That one thing that makes the weekend special.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s the nicest text you''ve received recently?', 'Describe it (don''t screenshot — just tell us).', 'task', 'social', 1, 25, false, false, true, true, 0),
('What would you do if you won the lottery tomorrow?', 'First three things — go.', 'task', 'creative', 1, 30, false, false, true, true, 0),
('What''s the best meal you''ve ever had?', 'Where was it and what made it unforgettable?', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s your biggest pet peeve?', 'The little thing that drives you absolutely crazy.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s the last photo in your camera roll?', 'Describe it without showing it.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What do you collect (or wish you collected)?', 'Sneakers, books, vinyl, nothing? Tell us.', 'task', 'creative', 1, 20, false, false, true, true, 0),
('What''s a movie that made you cry?', 'No shame. Which one got you?', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your current favorite song?', 'The one on repeat right now.', 'task', 'creative', 1, 20, false, false, true, true, 0),
('Describe your style in 3 words', 'How would you sum up your look?', 'task', 'creative', 1, 20, false, false, true, true, 0),
('What''s your coffee (or tea) order?', 'Or if you don''t drink either, your go-to beverage.', 'task', 'social', 1, 15, false, false, true, true, 0),
('What''s one thing you''re grateful for right now?', 'In this exact moment.', 'task', 'mental', 1, 20, false, false, true, true, 0),
('If you could live anywhere, where would it be?', 'City, country, vibe — describe it.', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your guilty pleasure?', 'That thing you secretly love and aren''t proud of.', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s the funniest thing that happened to you recently?', 'Something that still cracks you up.', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s your favorite board or video game?', 'All-time favorite. What do you play?', 'task', 'creative', 1, 20, false, false, true, true, 0),
('What did you want to be when you grew up?', 'The dream job from childhood.', 'task', 'mental', 1, 20, false, false, true, true, 0),
('What''s the best gift you''ve ever received?', 'What made it so special?', 'task', 'social', 1, 25, false, false, true, true, 0),
('If you could master any instrument overnight, which one?', 'Piano, guitar, drums, theremin?', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s a hill you''ll die on?', 'An opinion you will NEVER change.', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s the weirdest dream you''ve had?', 'Give us the highlights.', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your favorite way to spend a rainy day?', 'Inside plans, cozy vibes — describe it.', 'task', 'mental', 1, 20, false, false, true, true, 0),
('What''s the best thing about your best friend?', 'One trait that makes them amazing.', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s your zodiac sign and do you believe in it?', 'Drop your sign and your take.', 'task', 'social', 1, 20, false, false, true, true, 0),
('If you could only eat one cuisine forever, what would it be?', 'Italian, Mexican, Japanese, Thai — pick one.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s the most spontaneous thing you''ve done?', 'That time you just went for it.', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s your favorite quote?', 'A line that resonates with you.', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What''s the first thing you notice about people?', 'Eyes, smile, energy, style — what grabs you?', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s your current obsession?', 'A show, hobby, food, person — what''s consuming your brain?', 'task', 'creative', 1, 25, false, false, true, true, 0),
('Describe your personality in one word', 'Just one. Make it count.', 'task', 'mental', 1, 20, false, false, true, true, 0),
('What''s the last thing that made you proud?', 'Something you accomplished recently.', 'task', 'mental', 1, 25, false, false, true, true, 0),
('If you could have dinner with anyone, who?', 'Living or dead. Who sits across from you?', 'task', 'creative', 1, 30, false, false, true, true, 0),
('What''s your favorite type of weather?', 'Sunshine, rain, snow, thunderstorms — what do you love?', 'task', 'social', 1, 15, false, false, true, true, 0),
('What would your autobiography title be?', 'Sum up your life in a book title.', 'task', 'creative', 1, 30, false, false, true, true, 0),
('What''s the bravest thing you''ve ever done?', 'A moment when you surprised yourself.', 'task', 'mental', 1, 30, false, false, true, true, 0),
('What''s your most-played song of all time?', 'Check your Spotify Wrapped or just guess.', 'task', 'creative', 1, 20, false, false, true, true, 0),
('If today had a color, what would it be?', 'And why that color?', 'task', 'creative', 1, 20, false, false, true, true, 0),
('What''s something you''re bad at but love doing?', 'Singing, cooking, dancing — no shame.', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s your ideal way to spend a Friday night?', 'Out, in, with friends, alone — your perfect Friday.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What makes you feel most like yourself?', 'An activity, a place, a person — what centers you?', 'task', 'mental', 1, 30, false, false, true, true, 0),
('What''s your favorite number and why?', 'There''s always a story behind it.', 'task', 'creative', 1, 15, false, false, true, true, 0),
('What''s one thing you''d tell your younger self?', 'One sentence of advice.', 'task', 'mental', 1, 25, false, false, true, true, 0),
('What''s a trend you don''t understand?', 'Something popular that you just can''t get into.', 'task', 'social', 1, 20, false, false, true, true, 0),
('What''s the best part of your day so far?', 'Right now — what''s been the highlight?', 'task', 'mental', 1, 20, false, false, true, true, 0),
('What would you bring to a deserted island?', 'One item only. Choose wisely.', 'task', 'creative', 1, 25, false, false, true, true, 0),
('What''s the most interesting thing about where you live?', 'A fun fact about your city or town.', 'task', 'social', 1, 25, false, false, true, true, 0),
('What''s your favorite way to recharge?', 'After a long day, what fills your tank back up?', 'task', 'mental', 1, 20, false, false, true, true, 0),
('What''s a word that describes today?', 'Sum up the entire day in a single word.', 'task', 'mental', 1, 15, false, false, true, true, 0),
('If you could learn one language instantly, which one?', 'Spanish, Japanese, sign language — what would you pick?', 'task', 'creative', 1, 25, false, false, true, true, 0);

-- ===================== 100 POLLS (3-4 options each) =====================
-- Inserted as challenges first, options added via explicit INSERT below

INSERT INTO public.challenges (title, description, type, category, difficulty, xp_reward, requires_photo, requires_video, requires_text, is_active, participant_count) VALUES
('P01: Best morning drink?', 'How do you start your day?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P02: Favorite workout style?', 'How do you like to move?', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('P03: Ideal Friday night?', 'What does your perfect Friday look like?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P04: What motivates you most?', 'What keeps you going?', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P05: Favorite season?', 'Pick your vibe', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P06: Best study/work music?', 'What plays when you focus?', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('P07: Go-to fast food?', 'When you need it quick', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P08: Best social media platform?', 'Where do you spend your time?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P09: Favorite type of movie?', 'Movie night pick', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('P10: Best way to relax?', 'After a long day', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P11: Favorite cuisine?', 'If you had to pick one forever', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P12: How do you commute?', 'Getting around', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P13: Favorite music genre?', 'What hits different?', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('P14: Dream vacation type?', 'Where are we going?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P15: Best pet?', 'If you could only have one', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P16: Favorite time of day?', 'When do you feel your best?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P17: Best breakfast food?', 'Morning fuel', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P18: Favorite sport to watch?', 'Game day pick', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('P19: Best streaming service?', 'Where is the content?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P20: How do you learn best?', 'Learning style', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P21: Favorite holiday?', 'Best time of year', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P22: Best pizza topping?', 'The real debate', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P23: Ideal superpower?', 'Pick your power', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P24: Favorite app category?', 'What apps do you use most?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P25: Best weekend activity?', 'How do you spend your weekends?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P26: Favorite ice cream flavor?', 'Scoop selection', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P27: Best color to wear?', 'Wardrobe staple', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('P28: Morning routine priority?', 'First thing you do', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P29: Favorite type of book?', 'What do you read?', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P30: Best snack?', 'Between meals', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P31: Dream career field?', 'If anything was possible', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P32: Favorite weather?', 'Ideal conditions', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P33: Best way to exercise?', 'Movement matters', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('P34: Favorite dessert?', 'Sweet endings', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P35: Best way to spend $100?', 'You just found a hundred', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P36: Favorite type of content?', 'What do you consume?', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('P37: Best date idea?', 'Plan the perfect date', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P38: Favorite shoe type?', 'Footwear vibes', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P39: Best stress reliever?', 'When you need to decompress', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P40: Favorite type of workout music?', 'Gym playlist', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('P41: Best sandwich?', 'Build the ultimate', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P42: Favorite game type?', 'How do you play?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P43: Best way to wake up?', 'Alarm style', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P44: Favorite condiment?', 'What goes on everything?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P45: Best productivity hack?', 'How do you get stuff done?', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P46: Favorite outdoor activity?', 'Get outside', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('P47: Best comfort food?', 'When you need a hug from food', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P48: Favorite room in the house?', 'Where do you hang?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P49: Best gift to receive?', 'What makes you happy?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P50: Favorite way to travel?', 'Mode of transport', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P51: Best phone brand?', 'Tech loyalty', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P52: Favorite chip flavor?', 'Snack aisle showdown', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P53: Best self-care activity?', 'Treat yourself how?', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P54: Favorite type of coffee?', 'Caffeine order', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P55: Best weekend morning?', 'How do you spend it?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P56: Favorite art form?', 'Creative expression', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('P57: Best way to meet people?', 'Social strategy', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P58: Favorite fruit?', 'Nature''s candy', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P59: Best late night snack?', 'Midnight munchies', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P60: Favorite type of dance?', 'Move your body', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('P61: Best life advice?', 'Words to live by', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P62: Favorite type of restaurant?', 'Dining out style', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P63: Best morning habit?', 'Start strong', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P64: Favorite water activity?', 'Get wet', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('P65: Best conversation starter?', 'How do you break the ice?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P66: Favorite type of tea?', 'Tea time', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P67: Best night in activity?', 'Staying home', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P68: Favorite vegetable?', 'Yes, really', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P69: Best workout time?', 'When do you train?', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('P70: Favorite type of humor?', 'What makes you laugh?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P71: Best way to save money?', 'Financial move', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P72: Favorite adventure type?', 'How do you explore?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P73: Best phone habit?', 'Digital wellness', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P74: Favorite pasta shape?', 'Carb selection', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P75: Best way to wind down?', 'Before bed', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P76: Favorite photo subject?', 'What do you photograph most?', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('P77: Best rainy day activity?', 'When it pours', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P78: Favorite bread?', 'Carb of choice', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P79: Best social gathering?', 'How do you hang?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P80: Favorite childhood game?', 'Throwback', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P81: Best daily habit?', 'Non-negotiable', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P82: Favorite candy?', 'Sweet tooth', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P83: Best car type?', 'Dream ride', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P84: Favorite board game?', 'Game night', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P85: Best morning exercise?', 'Wake-up movement', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('P86: Favorite cake flavor?', 'Birthday pick', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P87: Best social skill?', 'People power', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P88: Favorite smoothie base?', 'Blend it up', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P89: Best weekend trip?', 'Quick getaway', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P90: Favorite kitchen tool?', 'Cooking essential', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P91: Best way to celebrate?', 'Good news — now what?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P92: Favorite sleeping position?', 'How do you sleep?', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P93: Best creative outlet?', 'Express yourself', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('P94: Favorite sandwich bread?', 'Foundation matters', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P95: Best gym equipment?', 'If you could only use one', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('P96: Favorite drink mixer?', 'Bar basics', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P97: Best mindfulness practice?', 'Inner peace', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('P98: Favorite road trip snack?', 'Highway fuel', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P99: Best houseplant?', 'Green thumb pick', 'poll', 'social', 1, 25, false, false, false, true, 0),
('P100: Favorite scent?', 'What smells best?', 'poll', 'social', 1, 25, false, false, false, true, 0);

-- ===================== 100 WOULD YOU RATHER =====================
INSERT INTO public.challenges (title, description, type, category, difficulty, xp_reward, requires_photo, requires_video, requires_text, is_active, participant_count) VALUES
('Fly or be invisible?', 'Classic superpower dilemma', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Read minds or predict the future?', 'Knowledge is power', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Live in the past or the future?', 'Time travel one way', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Never use social media again or never watch TV again?', 'Digital sacrifice', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Be famous or be rich?', 'You can''t pick both', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Always be cold or always be hot?', 'Temperature torture', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Have super speed or super strength?', 'Physical superpower', 'poll', 'physical', 1, 25, false, false, false, true, 0),
('Only eat pizza or only eat tacos forever?', 'Food commitment', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Live in a treehouse or a houseboat?', 'Unique home', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('Never eat cheese or never eat chocolate?', 'Tough sacrifice', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Be able to talk to animals or speak every language?', 'Communication gift', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Always have to sing or always have to dance?', 'Public expression', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('No internet for a month or no phone for a month?', 'Digital detox', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Teleport anywhere or time travel?', 'Space vs time', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Win the lottery or find your dream job?', 'Money vs passion', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Always be 10 minutes late or 20 minutes early?', 'Time management', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Give up music or give up movies?', 'Entertainment sacrifice', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('Have a personal chef or a personal trainer?', 'Lifestyle upgrade', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Be a night owl forever or a morning person forever?', 'Locked schedule', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Live without AC or live without heating?', 'Climate commitment', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Only listen to one song forever or never hear music again?', 'Musical ultimatum', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('Be the funniest person or the smartest person in the room?', 'Social skill', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Have more time or more money?', 'The real currency', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Always have a full phone battery or a full gas tank?', 'Modern essentials', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Give up coffee or give up alcohol?', 'Beverage breakup', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Be stuck in traffic or stuck in a long line?', 'Waiting game', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Never age physically or never age mentally?', 'Eternal youth', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Have a pause button or a rewind button for life?', 'Life remote', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Only wear one color forever or wear every color at once?', 'Fashion dilemma', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('Be a famous athlete or a famous musician?', 'Dream career', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Know how you die or when you die?', 'Morbid curiosity', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Give up breakfast or give up dinner?', 'Meal sacrifice', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Have a photographic memory or be amazing at math?', 'Brain boost', 'poll', 'mental', 1, 25, false, false, false, true, 0),
('Live in a tiny house or a huge old mansion?', 'Home sweet home', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Always speak your mind or never speak again?', 'Voice vs silence', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Control fire or control water?', 'Elemental power', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('Never be stuck in traffic or never get a cold again?', 'Daily annoyance', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Explore space or explore the deep ocean?', 'Unknown frontier', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('Have unlimited storage or unlimited data?', 'Digital need', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Be able to breathe underwater or fly for 10 minutes a day?', 'Limited power', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Relive your favorite day or erase your worst day?', 'Memory power', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Have free Spotify or free Netflix forever?', 'Streaming choice', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Be immune to hangovers or never need sleep?', 'Body hack', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Only use a fork or only use chopsticks?', 'Utensil commitment', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Know every language or play every instrument?', 'Talent unlock', 'poll', 'creative', 1, 25, false, false, false, true, 0),
('Live without a mirror or live without music?', 'Sensory loss', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Be famous on social media or respected in your field?', 'Recognition type', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Always have perfect hair or perfect skin?', 'Appearance perk', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Free flights forever or free hotels forever?', 'Travel perk', 'poll', 'social', 1, 25, false, false, false, true, 0),
('Lose your phone or lose your wallet?', 'Pocket panic', 'poll', 'social', 1, 25, false, false, false, true, 0);

-- ===================== WYR OPTIONS (2 each) =====================
DO $$
DECLARE
  rec RECORD;
  opt_a TEXT;
  opt_b TEXT;
BEGIN
  FOR rec IN
    SELECT id, title FROM public.challenges
    WHERE type = 'poll' AND title NOT LIKE 'P%:%'
    ORDER BY created_at
  LOOP
    IF position(' or ' IN rec.title) > 0 THEN
      opt_a := trim(split_part(rec.title, ' or ', 1));
      opt_b := trim(replace(split_part(rec.title, ' or ', 2), '?', ''));
    ELSE
      opt_a := 'Option A';
      opt_b := 'Option B';
    END IF;
    INSERT INTO public.poll_options (challenge_id, text, position, vote_count)
    VALUES (rec.id, opt_a, 0, 0), (rec.id, opt_b, 1, 0)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ===================== POLL OPTIONS (3-4 each) =====================
-- Keyed by the P## prefix in title

DO $$
DECLARE
  cid uuid;
  opts TEXT[];
  i INT;
BEGIN
  -- Helper: look up challenge id by title prefix and insert options
  -- P01
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P01:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Coffee',0,0),(cid,'Tea',1,0),(cid,'Water',2,0),(cid,'Juice',3,0); END IF;
  -- P02
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P02:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Weights',0,0),(cid,'Running',1,0),(cid,'Yoga',2,0),(cid,'HIIT',3,0); END IF;
  -- P03
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P03:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Going out',0,0),(cid,'Movie night in',1,0),(cid,'Dinner with friends',2,0),(cid,'Gaming',3,0); END IF;
  -- P04
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P04:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Money',0,0),(cid,'Passion',1,0),(cid,'Family',2,0),(cid,'Growth',3,0); END IF;
  -- P05
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P05:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Spring',0,0),(cid,'Summer',1,0),(cid,'Fall',2,0),(cid,'Winter',3,0); END IF;
  -- P06
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P06:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Lo-fi beats',0,0),(cid,'Pop',1,0),(cid,'Classical',2,0),(cid,'Silence',3,0); END IF;
  -- P07
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P07:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Chick-fil-A',0,0),(cid,'McDonald''s',1,0),(cid,'Chipotle',2,0),(cid,'Taco Bell',3,0); END IF;
  -- P08
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P08:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Instagram',0,0),(cid,'TikTok',1,0),(cid,'X / Twitter',2,0),(cid,'YouTube',3,0); END IF;
  -- P09
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P09:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Comedy',0,0),(cid,'Action',1,0),(cid,'Horror',2,0),(cid,'Drama',3,0); END IF;
  -- P10
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P10:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Netflix & chill',0,0),(cid,'Hot bath',1,0),(cid,'Walk outside',2,0),(cid,'Read a book',3,0); END IF;
  -- P11
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P11:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Italian',0,0),(cid,'Mexican',1,0),(cid,'Japanese',2,0),(cid,'American',3,0); END IF;
  -- P12
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P12:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Drive',0,0),(cid,'Bus/Train',1,0),(cid,'Walk/Bike',2,0),(cid,'Remote',3,0); END IF;
  -- P13
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P13:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Hip-Hop/Rap',0,0),(cid,'Pop',1,0),(cid,'Rock',2,0),(cid,'R&B',3,0); END IF;
  -- P14
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P14:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Beach resort',0,0),(cid,'Mountain cabin',1,0),(cid,'City trip',2,0),(cid,'Road trip',3,0); END IF;
  -- P15
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P15:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Dog',0,0),(cid,'Cat',1,0),(cid,'Fish',2,0),(cid,'No pets',3,0); END IF;
  -- P16
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P16:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Morning',0,0),(cid,'Afternoon',1,0),(cid,'Evening',2,0),(cid,'Late night',3,0); END IF;
  -- P17
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P17:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Eggs',0,0),(cid,'Cereal',1,0),(cid,'Pancakes',2,0),(cid,'Smoothie',3,0); END IF;
  -- P18
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P18:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Football',0,0),(cid,'Basketball',1,0),(cid,'Soccer',2,0),(cid,'None',3,0); END IF;
  -- P19
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P19:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Netflix',0,0),(cid,'YouTube',1,0),(cid,'Disney+',2,0),(cid,'Hulu',3,0); END IF;
  -- P20
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P20:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Reading',0,0),(cid,'Videos',1,0),(cid,'Hands-on',2,0),(cid,'Listening',3,0); END IF;
  -- P21
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P21:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Christmas',0,0),(cid,'Halloween',1,0),(cid,'4th of July',2,0),(cid,'Thanksgiving',3,0); END IF;
  -- P22
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P22:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Pepperoni',0,0),(cid,'Cheese',1,0),(cid,'Supreme',2,0),(cid,'Hawaiian',3,0); END IF;
  -- P23
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P23:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Flying',0,0),(cid,'Invisibility',1,0),(cid,'Teleportation',2,0),(cid,'Mind reading',3,0); END IF;
  -- P24
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P24:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Social media',0,0),(cid,'Games',1,0),(cid,'Productivity',2,0),(cid,'Music',3,0); END IF;
  -- P25
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P25:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Brunch',0,0),(cid,'Hike',1,0),(cid,'Sleep in',2,0),(cid,'Shopping',3,0); END IF;
  -- P26
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P26:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Chocolate',0,0),(cid,'Vanilla',1,0),(cid,'Strawberry',2,0),(cid,'Cookie dough',3,0); END IF;
  -- P27
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P27:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Black',0,0),(cid,'White',1,0),(cid,'Blue',2,0),(cid,'Earth tones',3,0); END IF;
  -- P28
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P28:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Check phone',0,0),(cid,'Shower',1,0),(cid,'Coffee',2,0),(cid,'Exercise',3,0); END IF;
  -- P29
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P29:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Self-help',0,0),(cid,'Fiction',1,0),(cid,'Biography',2,0),(cid,'Sci-fi',3,0); END IF;
  -- P30
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P30:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Chips',0,0),(cid,'Fruit',1,0),(cid,'Nuts',2,0),(cid,'Candy',3,0); END IF;
  -- P31
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P31:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Tech',0,0),(cid,'Medicine',1,0),(cid,'Arts',2,0),(cid,'Sports',3,0); END IF;
  -- P32
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P32:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Sunny & warm',0,0),(cid,'Cool & breezy',1,0),(cid,'Rainy',2,0),(cid,'Snowy',3,0); END IF;
  -- P33
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P33:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Walking',0,0),(cid,'Lifting',1,0),(cid,'Swimming',2,0),(cid,'Team sports',3,0); END IF;
  -- P34
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P34:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Cake',0,0),(cid,'Ice cream',1,0),(cid,'Brownies',2,0),(cid,'Pie',3,0); END IF;
  -- P35
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P35:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Clothes',0,0),(cid,'Food',1,0),(cid,'Save it',2,0),(cid,'Experience',3,0); END IF;
  -- P36
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P36:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Short videos',0,0),(cid,'Podcasts',1,0),(cid,'Articles',2,0),(cid,'Long videos',3,0); END IF;
  -- P37
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P37:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Dinner out',0,0),(cid,'Adventure',1,0),(cid,'Cook together',2,0),(cid,'Movie',3,0); END IF;
  -- P38
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P38:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Sneakers',0,0),(cid,'Boots',1,0),(cid,'Sandals',2,0),(cid,'Dress shoes',3,0); END IF;
  -- P39
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P39:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Exercise',0,0),(cid,'Music',1,0),(cid,'Meditation',2,0),(cid,'Talking to someone',3,0); END IF;
  -- P40
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P40:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Hip-hop',0,0),(cid,'EDM',1,0),(cid,'Rock',2,0),(cid,'Pop',3,0); END IF;
  -- P41
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P41:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Turkey club',0,0),(cid,'BLT',1,0),(cid,'Grilled cheese',2,0),(cid,'Philly cheesesteak',3,0); END IF;
  -- P42
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P42:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Video games',0,0),(cid,'Board games',1,0),(cid,'Card games',2,0),(cid,'Sports',3,0); END IF;
  -- P43
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P43:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Alarm',0,0),(cid,'Naturally',1,0),(cid,'Someone wakes me',2,0),(cid,'Sunrise light',3,0); END IF;
  -- P44
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P44:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Ketchup',0,0),(cid,'Hot sauce',1,0),(cid,'Ranch',2,0),(cid,'Mustard',3,0); END IF;
  -- P45
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P45:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'To-do lists',0,0),(cid,'Time blocking',1,0),(cid,'Just start',2,0),(cid,'Music/focus mode',3,0); END IF;
  -- P46
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P46:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Hiking',0,0),(cid,'Beach',1,0),(cid,'Biking',2,0),(cid,'Camping',3,0); END IF;
  -- P47
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P47:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Mac & cheese',0,0),(cid,'Pizza',1,0),(cid,'Ramen',2,0),(cid,'Fried chicken',3,0); END IF;
  -- P48
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P48:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Bedroom',0,0),(cid,'Living room',1,0),(cid,'Kitchen',2,0),(cid,'Bathroom',3,0); END IF;
  -- P49
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P49:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Money',0,0),(cid,'Experiences',1,0),(cid,'Tech',2,0),(cid,'Handmade',3,0); END IF;
  -- P50
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P50:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Car',0,0),(cid,'Train',1,0),(cid,'Plane',2,0),(cid,'Boat',3,0); END IF;
  -- P51-P60
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P51:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Apple',0,0),(cid,'Samsung',1,0),(cid,'Google',2,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P52:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Salt & vinegar',0,0),(cid,'BBQ',1,0),(cid,'Sour cream & onion',2,0),(cid,'Plain',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P53:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Face mask',0,0),(cid,'Long shower',1,0),(cid,'Nap',2,0),(cid,'Journaling',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P54:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Latte',0,0),(cid,'Cold brew',1,0),(cid,'Espresso',2,0),(cid,'Drip coffee',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P55:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Sleep in',0,0),(cid,'Brunch out',1,0),(cid,'Workout',2,0),(cid,'Farmers market',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P56:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Music',0,0),(cid,'Drawing/Painting',1,0),(cid,'Writing',2,0),(cid,'Photography',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P57:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Through friends',0,0),(cid,'Events',1,0),(cid,'Apps',2,0),(cid,'Work/school',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P58:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Strawberry',0,0),(cid,'Banana',1,0),(cid,'Mango',2,0),(cid,'Apple',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P59:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Cereal',0,0),(cid,'Ice cream',1,0),(cid,'Chips',2,0),(cid,'Leftovers',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P60:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Hip-hop',0,0),(cid,'Salsa',1,0),(cid,'Freestyle',2,0),(cid,'TikTok trends',3,0); END IF;
  -- P61-P70
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P61:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Be yourself',0,0),(cid,'Work hard',1,0),(cid,'Be kind',2,0),(cid,'Stay curious',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P62:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Casual diner',0,0),(cid,'Fine dining',1,0),(cid,'Fast casual',2,0),(cid,'Food truck',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P63:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Hydrate',0,0),(cid,'Stretch',1,0),(cid,'Gratitude journal',2,0),(cid,'Make the bed',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P64:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Swimming',0,0),(cid,'Surfing',1,0),(cid,'Kayaking',2,0),(cid,'Just floating',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P65:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Compliment',0,0),(cid,'Ask a question',1,0),(cid,'Joke',2,0),(cid,'Introduce yourself',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P66:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Green',0,0),(cid,'Black',1,0),(cid,'Herbal',2,0),(cid,'Matcha',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P67:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Movie marathon',0,0),(cid,'Cook dinner',1,0),(cid,'Video games',2,0),(cid,'Read',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P68:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Broccoli',0,0),(cid,'Corn',1,0),(cid,'Avocado',2,0),(cid,'Sweet potato',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P69:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'5-6 AM',0,0),(cid,'Lunch break',1,0),(cid,'After work',2,0),(cid,'Late night',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P70:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Sarcasm',0,0),(cid,'Slapstick',1,0),(cid,'Dark humor',2,0),(cid,'Puns',3,0); END IF;
  -- P71-P80
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P71:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Cook at home',0,0),(cid,'Cancel subscriptions',1,0),(cid,'Side hustle',2,0),(cid,'Budget app',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P72:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Road trip',0,0),(cid,'Backpacking',1,0),(cid,'Cruise',2,0),(cid,'Staycation',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P73:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Do not disturb',0,0),(cid,'Screen time limits',1,0),(cid,'Grayscale mode',2,0),(cid,'App timers',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P74:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Penne',0,0),(cid,'Spaghetti',1,0),(cid,'Rigatoni',2,0),(cid,'Fettuccine',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P75:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Read',0,0),(cid,'Meditate',1,0),(cid,'Scroll phone',2,0),(cid,'Music',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P76:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Food',0,0),(cid,'Selfies',1,0),(cid,'Nature',2,0),(cid,'Pets',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P77:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Netflix',0,0),(cid,'Cook/Bake',1,0),(cid,'Nap',2,0),(cid,'Board games',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P78:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Sourdough',0,0),(cid,'White',1,0),(cid,'Wheat',2,0),(cid,'Rye',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P79:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Small dinner party',0,0),(cid,'Big party',1,0),(cid,'One-on-one',2,0),(cid,'Online hangout',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P80:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Tag',0,0),(cid,'Hide and seek',1,0),(cid,'Video games',2,0),(cid,'Board games',3,0); END IF;
  -- P81-P90
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P81:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Exercise',0,0),(cid,'Reading',1,0),(cid,'Journaling',2,0),(cid,'Hydrating',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P82:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Gummy bears',0,0),(cid,'Chocolate bar',1,0),(cid,'Skittles',2,0),(cid,'Sour patch',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P83:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'SUV',0,0),(cid,'Sedan',1,0),(cid,'Truck',2,0),(cid,'Sports car',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P84:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Monopoly',0,0),(cid,'Scrabble',1,0),(cid,'Settlers of Catan',2,0),(cid,'Uno',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P85:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Walk/Jog',0,0),(cid,'Yoga',1,0),(cid,'Push-ups',2,0),(cid,'Stretching',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P86:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Chocolate',0,0),(cid,'Vanilla',1,0),(cid,'Red velvet',2,0),(cid,'Carrot',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P87:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Listening',0,0),(cid,'Humor',1,0),(cid,'Empathy',2,0),(cid,'Confidence',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P88:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Banana',0,0),(cid,'Almond milk',1,0),(cid,'Yogurt',2,0),(cid,'Protein powder',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P89:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Beach town',0,0),(cid,'Cabin',1,0),(cid,'Nearby city',2,0),(cid,'National park',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P90:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Air fryer',0,0),(cid,'Knife set',1,0),(cid,'Cast iron pan',2,0),(cid,'Blender',3,0); END IF;
  -- P91-P100
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P91:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Dinner out',0,0),(cid,'Party',1,0),(cid,'Trip',2,0),(cid,'Buy yourself something',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P92:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Side',0,0),(cid,'Back',1,0),(cid,'Stomach',2,0),(cid,'Changes every night',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P93:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Music',0,0),(cid,'Art/Drawing',1,0),(cid,'Writing',2,0),(cid,'Cooking',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P94:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Sourdough',0,0),(cid,'White',1,0),(cid,'Wheat',2,0),(cid,'Wrap/Tortilla',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P95:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Dumbbells',0,0),(cid,'Treadmill',1,0),(cid,'Cable machine',2,0),(cid,'Kettlebell',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P96:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Lemonade',0,0),(cid,'Soda',1,0),(cid,'Tonic',2,0),(cid,'Juice',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P97:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Meditation',0,0),(cid,'Deep breathing',1,0),(cid,'Yoga',2,0),(cid,'Gratitude practice',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P98:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Chips',0,0),(cid,'Trail mix',1,0),(cid,'Beef jerky',2,0),(cid,'Candy',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P99:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Pothos',0,0),(cid,'Snake plant',1,0),(cid,'Succulent',2,0),(cid,'Monstera',3,0); END IF;
  SELECT id INTO cid FROM public.challenges WHERE title LIKE 'P100:%' LIMIT 1;
  IF cid IS NOT NULL THEN INSERT INTO public.poll_options (challenge_id,text,position,vote_count) VALUES (cid,'Fresh laundry',0,0),(cid,'Coffee',1,0),(cid,'Rain',2,0),(cid,'Vanilla',3,0); END IF;
END $$;

-- Clean up the P## prefix from poll titles so they look good in the app
UPDATE public.challenges
  SET title = trim(substring(title from ': (.*)$'))
  WHERE title LIKE 'P%:%' AND type = 'poll';

COMMIT;
