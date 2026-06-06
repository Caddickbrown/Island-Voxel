// game/npcs.js — All 22 NPC definitions with daily schedules
// Schedules: [startHour, endHour, areaKey, activityLabel]
// Area keys must match lowercase AREAS keys (or home keys resolved below)

export const NPC_DEFS = [
  {
    name: 'Mabel', job: 'Baker',
    color: 0xe8a87c, skinTone: 0xf0c8a0, hairColor: 0x8B4513,
    schedule: [
      [5,  8,  'bakery',       'Baking 🍞'],
      [8,  12, 'bakery',       'Selling bread 🥖'],
      [12, 14, 'sandy_bay',    'On break 🏖️'],
      [14, 18, 'bakery',       'Baking for tomorrow 🍞'],
      [18, 21, 'library',      'Reading 📚'],
      [21, 5,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Gus', job: 'Postman',
    color: 0x5b9bd5, skinTone: 0xd4956a, hairColor: 0x1a1a1a,
    schedule: [
      [6,  7,  'post_office',  'Sorting mail 📮'],
      [7,  9,  'town_square',  'Delivering 📬'],
      [9,  11, 'library',      'Delivering 📬'],
      [11, 13, 'farm',         'Delivering 📬'],
      [13, 14, 'harbour',      'Lunch break 🎣'],
      [14, 16, 'workshop',     'Delivering 📬'],
      [16, 18, 'post_office',  'Back at base 📮'],
      [18, 22, 'bakery',       'Off-duty coffee ☕'],
      [22, 6,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Fern', job: 'Farmer',
    color: 0x7bc67e, skinTone: 0xb87850, hairColor: 0x8B6014,
    schedule: [
      [4,  12, 'farm',         'Farming 🌾'],
      [12, 13, 'town_square',  "Farmer's market 🥕"],
      [13, 15, 'workshop',     'Building 🔨'],
      [15, 18, 'farm',         'Farming 🌾'],
      [18, 20, 'sandy_bay',    'Evening walk 🌅'],
      [20, 4,  'plains',       'Sleeping 💤'],
    ],
  },
  {
    name: 'Olive', job: 'Shopkeeper',
    color: 0xd4a0d4, skinTone: 0xe8b890, hairColor: 0x5C2E0A,
    schedule: [
      [8,  13, 'the_commons',  'Minding the store 🛍️'],
      [13, 14, 'cafe',         'Lunch break ☕'],
      [14, 18, 'town_square',  'Tending shop 🛍️'],
      [18, 20, 'wind_ridge',   'Evening walk 🌄'],
      [20, 23, 'library',      'Reading 📖'],
      [23, 8,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Rosa', job: 'Librarian',
    color: 0xa29bfe, skinTone: 0x8b5e3c, hairColor: 0xB22222,
    schedule: [
      [9,  19, 'library',      'Keeping the library 📚'],
      [19, 21, 'forest',       'Evening walk 🌲'],
      [21, 9,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Jack', job: 'Fisherman',
    color: 0xc47d52, skinTone: 0xc08050, hairColor: 0x4A2C0A,
    schedule: [
      [5,  10, 'harbour',      'Fishing 🎣'],
      [10, 12, 'sandy_bay',    'Mending nets 🪢'],
      [12, 14, 'town_square',  'Selling catch 🐟'],
      [14, 17, 'harbour',      'Fishing 🎣'],
      [17, 20, 'pub',          'Having a pint 🍺'],
      [20, 5,  'fishing_village', 'Sleeping 💤'],
    ],
  },
  {
    name: 'Pete', job: 'Farmer',
    color: 0x8db87a, skinTone: 0xa06840, hairColor: 0x3D1A00,
    schedule: [
      [4,  7,  'farm',         'Tending animals 🐄'],
      [7,  12, 'farm',         'Working the fields 🌾'],
      [12, 13, 'town_square',  'Selling produce 🥕'],
      [13, 16, 'community_farm','Harvesting 🌾'],
      [16, 19, 'workshop',     'Fixing tools 🔧'],
      [19, 21, 'pub',          'Unwinding 🍺'],
      [21, 4,  'plains',       'Sleeping 💤'],
    ],
  },
  {
    name: 'Barney', job: 'Barkeeper',
    color: 0xd4a853, skinTone: 0xd4956a, hairColor: 0x2C1A08,
    schedule: [
      [10, 14, 'pub',          'Preparing 🍺'],
      [14, 23, 'pub',          'Running The Anchor ⚓'],
      [23, 1,  'pub',          'Closing up 🍺'],
      [1,  10, 'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Suki', job: 'Barista',
    color: 0xf4c77e, skinTone: 0xf5d5a0, hairColor: 0x1a1a1a,
    schedule: [
      [5,  8,  'cafe',         'Opening up ☕'],
      [8,  14, 'cafe',         'Making coffee ☕'],
      [14, 15, 'town_square',  'Lunch break 🥗'],
      [15, 19, 'cafe',         'Afternoon rush ☕'],
      [19, 21, 'library',      'Reading 📚'],
      [21, 5,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Clara', job: 'Teacher',
    color: 0x74b9e8, skinTone: 0xf2c89c, hairColor: 0x8B6914,
    schedule: [
      [7,  9,  'cafe',         'Morning coffee ☕'],
      [9,  15, 'school',       'Teaching 📐'],
      [15, 18, 'library',      'Marking work 📝'],
      [18, 20, 'town_square',  'Evening stroll 🌇'],
      [20, 7,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Rex', job: 'Teacher',
    color: 0x6ec97b, skinTone: 0xe08858, hairColor: 0x5C2E0A,
    schedule: [
      [8,  9,  'town_square',  'Morning walk 🌅'],
      [9,  15, 'school',       'Teaching 🔬'],
      [15, 17, 'workshop',     'Woodwork club 🔨'],
      [17, 20, 'pub',          'After-school pint 🍺'],
      [20, 8,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Otto', job: 'Engineer',
    color: 0xe17055, skinTone: 0xd08040, hairColor: 0x3D1A00,
    schedule: [
      [6,  7,  'workshop',     'Early start 🌄'],
      [7,  12, 'workshop',     'Working on the truck 🔧'],
      [12, 13, 'town_square',  'Lunch break 🥪'],
      [13, 18, 'workshop',     'Welding ⚙️'],
      [18, 20, 'pub',          'Evening pint 🍺'],
      [20, 6,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Petra', job: 'Artist',
    color: 0xf48fb1, skinTone: 0xf4c0a0, hairColor: 0xB22222,
    schedule: [
      [6,  10, 'treehouse',    'Morning painting 🎨'],
      [10, 13, 'town_square',  'Selling art 🖼️'],
      [13, 14, 'cafe',         'Lunch break ☕'],
      [14, 18, 'forest',       'Sketching in the woods 🌲'],
      [18, 21, 'treehouse',    'Evening painting 🎨'],
      [21, 6,  'forest',       'Sleeping 💤'],
    ],
  },
  {
    name: 'Jin', job: 'Botanist',
    color: 0x81c784, skinTone: 0xd4a070, hairColor: 0x1a1a1a,
    schedule: [
      [5,  8,  'forest',       'Early specimens 🌿'],
      [8,  13, 'science',      'Analysing samples 🔬'],
      [13, 14, 'town_square',  'Lunch break 🥗'],
      [14, 18, 'highland_forest', 'Field research 🌿'],
      [18, 20, 'library',      'Reading journals 📚'],
      [20, 5,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Old Will', job: 'Elder',
    color: 0xbcaaa4, skinTone: 0xd4956a, hairColor: 0xC0C0C0,
    schedule: [
      [7,  9,  'wind_ridge',   'Morning watch 🌅'],
      [9,  11, 'town_square',  'Morning stroll 🚶'],
      [11, 13, 'pub',          'Long lunch 🍺'],
      [13, 17, 'clifftops',    'Whittling 🪵'],
      [17, 19, 'sandy_bay',    'Watching the tide 🌊'],
      [19, 7,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Lena', job: 'Keeper',
    color: 0x80cbc4, skinTone: 0xe0a878, hairColor: 0xA0522D,
    schedule: [
      [5,  8,  'lighthouse',   'Tending the light 🔦'],
      [8,  12, 'harbour',      'Watching ships 🚢'],
      [12, 13, 'cafe',         'Quick lunch ☕'],
      [13, 17, 'lighthouse',   'Maintenance work 🔧'],
      [17, 19, 'hidden_beach', 'Evening walk 🌅'],
      [19, 5,  'fishing_village', 'Sleeping 💤'],
    ],
  },
  {
    name: 'Kai', job: 'Newcomer',
    color: 0xffcc80, skinTone: 0xc07848, hairColor: 0x4A2C0A,
    schedule: [
      [8,  10, 'hidden_beach', 'Morning swim 🏊'],
      [10, 13, 'town_square',  'Exploring 🗺️'],
      [13, 14, 'cafe',         'Lunch ☕'],
      [14, 17, 'harbour',      'Learning to fish 🎣'],
      [17, 19, 'sandy_bay',    'Evening bonfire 🔥'],
      [19, 8,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Bea', job: 'Child',
    color: 0xf06292, skinTone: 0xf8d4b0, hairColor: 0xFFD700,
    schedule: [
      [8,  9,  'village',      'Breakfast 🥣'],
      [9,  12, 'school',       'At school 📚'],
      [12, 13, 'village',      'Playing 🎮'],
      [13, 15, 'school',       'Afternoon class 📚'],
      [15, 18, 'forest',       'Adventure play 🌲'],
      [18, 20, 'village',      'Running around 🏃'],
      [20, 8,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Elliot', job: 'Child',
    color: 0x4dd0e1, skinTone: 0xf0c8a0, hairColor: 0x5C2E0A,
    schedule: [
      [8,  9,  'village',      'Breakfast 🥣'],
      [9,  12, 'school',       'At school 📚'],
      [12, 13, 'cafe',         'Lunch break ☕'],
      [13, 20, 'aquarium',     'Feeding the fish 🐟'],
      [20, 8,  'village',      'Sleeping 💤'],
    ],
  },
  {
    name: 'Captain Reed', job: 'Harbour Master',
    color: 0x2c5f7c, skinTone: 0xc88060, hairColor: 0x8B8B8B,
    schedule: [
      [6,  18, 'harbour',      'Minding the harbour ⚓'],
      [18, 21, 'pub',          'Evening at The Anchor 🍺'],
      [21, 6,  'fishing_village', 'Sleeping 💤'],
    ],
  },
  {
    name: 'Morwen', job: 'Fishmonger',
    color: 0x4a90a4, skinTone: 0xf0c8a0, hairColor: 0x5C2E0A,
    schedule: [
      [6,  10, 'harbour',      'Buying catch 🐟'],
      [10, 17, 'harbour',      'Selling fish 🐠'],
      [17, 20, 'the_commons',  'Market stall 🛒'],
      [20, 6,  'fishing_village', 'Sleeping 💤'],
    ],
  },
  {
    name: 'Corwin', job: 'Fishmonger',
    color: 0x5a8a6e, skinTone: 0xb87850, hairColor: 0x1a1a1a,
    schedule: [
      [4,  8,  'harbour',      'Out on the water 🚤'],
      [8,  14, 'harbour',      'Unloading catch 🐟'],
      [14, 17, 'kelp_cove',    'Harvesting kelp 🌿'],
      [17, 20, 'pub',          'After shift pint 🍺'],
      [20, 4,  'fishing_village', 'Sleeping 💤'],
    ],
  },
];

// Dialogue bank — keyed by NPC name (falls back to job)
export const DIALOGUE = {
  Elliot: [
    'Come see the jellyfish — they glow at night!',
    'I named every fish in the aquarium. My favourite is Bubbles.',
    'Did you know octopuses have three hearts?',
  ],
  'Old Will': [
    "I've been here longer than anyone.",
    "Sit a while — there's no hurry here.",
    "The island is most itself in the evening.",
    "The clifftops on a clear morning — nothing like it.",
  ],
  'Captain Reed': [
    "All vessels accounted for.",
    "Tide comes in sharp from the east. Mind the rocks.",
    "Been harbour master going on thirty years now.",
  ],
  Baker: [
    'The bread came out perfectly this morning!',
    'Try one of the cardamom buns — Rosa\'s recipe.',
    'The ovens are cooling down for the night.',
  ],
  Postman: [
    'Letters from the mainland arrived this morning.',
    'Always something new in the post bag.',
    'The dock path is beautiful at dawn.',
  ],
  Farmer: [
    'Up at dawn, that\'s the farmer\'s way.',
    'The crops are coming along nicely.',
    'The hens have been very productive this morning.',
  ],
  Shopkeeper: [
    'Can I help you find anything?',
    'We just got a fresh delivery in.',
    'Nearly closing time — last chance to browse!',
  ],
  Librarian: [
    'Have you read anything good lately?',
    'The archives go back over two hundred years.',
    'Silence is golden, as they say.',
  ],
  Fisherman: [
    'Good haul this morning from the east side.',
    'The tide was perfect at dawn.',
    'Nothing like the smell of the sea.',
  ],
  Barkeeper: [
    'The Anchor\'s always open for a friendly face.',
    'A warm fire and a cold pint — what more do you need?',
    'The regulars were in good form tonight.',
  ],
  Barista: [
    'Fresh coffee just came off the press.',
    'The terrace is lovely at this hour.',
    'Shall I put something on for you?',
  ],
  Teacher: [
    'The children asked such good questions today.',
    'Education is the greatest gift we can give.',
    'Learning never stops on this island.',
  ],
  Engineer: [
    'Morning checks on the solar panels.',
    'The solar system is running perfectly.',
    'Always something to fix or improve.',
  ],
  Artist: [
    'The morning light is perfect for sketching.',
    'I\'m working on a new series of the harbour.',
    'Every painting starts with just looking.',
  ],
  Botanist: [
    'Found a fascinating specimen this morning.',
    'I\'m cataloguing every plant on this island.',
    'The highland forest holds so many secrets.',
  ],
  Elder: [
    'Sit a while — there\'s no hurry here.',
    'The island has changed, but its heart hasn\'t.',
    'Lovely afternoon to just sit and watch.',
  ],
  Keeper: [
    'The light was on all night — all safe.',
    'You can see for miles from the lantern room.',
    'Time to light the lamp for the night.',
  ],
  Newcomer: [
    'Still finding my way around!',
    'What a beautiful island.',
    'Everyone\'s been so welcoming here.',
  ],
  'Harbour Master': [
    'All vessels accounted for.',
    'Tide comes in sharp from the east.',
    'Been harbour master going on thirty years.',
  ],
  Fishmonger: [
    'Freshest catch on the island, right here.',
    'Got mackerel, crab, and some lovely sole today.',
    'The kelp harvest was good this week.',
  ],
  Child: [
    'Have you seen any cool bugs today?',
    'I can climb that tree in thirty seconds.',
    'Race you to the beach!',
  ],
};
