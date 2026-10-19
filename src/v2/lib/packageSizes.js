// Typical US grocery package sizes, for the shopping list (v2 build step 4).
// Built from the ingredient names in the published recipe library (see
// scripts/package-coverage.mjs). Plain JS: Node scripts import it too.
//
// Each entry:
// - id: the ingredient key (stored on shopping list items and in
//   package_size_choices, migration 017), so keep ids stable.
// - display: the line's name when set (otherwise the shortest recipe name it
//   merged), for entries whose names aren't what you buy ("cooked rice").
// - names: what it matches, compared after normalizeName() in packages.js.
//   A name matches the whole ingredient name or its last words ("extra virgin
//   olive oil" ends with "olive oil"); exact(name) only the whole name, for
//   words that also appear inside other products ("pepper", "milk", "oil").
//   scaled(name, k) multiplies the converted amount (cooked rice is about a
//   third of its volume in dry rice).
// - measure: 'weight' (sizes in oz), 'volume' (fl oz) or 'count' (unit names
//   what's counted: 'each' for loose items, 'bunch', 'head', 'egg', 'piece',
//   'muffin', 'loaf'; a recipe amount in that unit converts one to one).
// - sizes: what it's sold in, with labels. Loose items are bought one at a
//   time, so 2 shows as "2".
// - to: conversions into the entry's unit that the measure doesn't give on its
//   own, as "one recipe unit is this many entry units". Recipes use g, oz, lb,
//   ml, cup, tbsp, tsp and "whole", and a few use can, bunch and slice.
// - Canned goods: a recipe's oz or g is the can's net weight (15 oz chickpeas
//   is one 15 oz can); only cups use the drained or poured amount. A bare
//   "can" (or "whole") is the standard can recipes mean: crushed tomatoes
//   28 oz, beans and chickpeas 15 oz, coconut milk 13.5 oz, broth 14.5 oz
//   (and, for entries not in the table yet, diced tomatoes 14.5 oz and
//   tomato sauce 15 oz). Several cans multiply.
// - driedHerb: a tsp of that herb means dried, so it goes to this staple
//   entry instead of the fresh one (findLineEntry in packages.js); tbsp, cups,
//   bunches, sprigs and "whole" stay fresh.
// - staple: kept at home by most people (salt, pepper, oils, spray, dried
//   herbs and spices, sugar, flour, baking soda and powder, vanilla); the
//   list starts them in "Already have". Spices have no sizes.
// - skip: never on the list (water, ice).
// - category: the shopping list group (CATEGORY_ORDER in src/lib/utils.js).
//
// "check:" comments mark sizes and conversions worth a second look.

const oz = (size, label = `${size} oz`) => ({ size, label })
const lb = (n, label = `${n} lb`) => ({ size: n * 16, label })
const floz = (size, label = `${size} fl oz`) => ({ size, label })
const one = (noun, plural) => ({ size: 1, label: `1 ${noun}`, plural })
const LOOSE = [{ size: 1, label: '1', plural: '' }]
const exact = (name) => ({ name, exact: true })
const scaled = (name, scale) => ({ name, scale })

const PRODUCE = 'Produce'
const MEAT = 'Meat & Seafood'
const DAIRY = 'Dairy & Eggs'
const GRAINS = 'Grains & Bread'
const PANTRY = 'Canned & Pantry'
const FROZEN = 'Frozen'

const spice = (id, names) => ({ id, names, measure: 'weight', unit: 'oz', sizes: [], staple: true, category: PANTRY })

export const PACKAGE_ENTRIES = [
  // ── Produce
  {
    id: 'green-onion',
    names: ['green onion', 'scallion', 'spring onion'],
    measure: 'count', unit: 'bunch', sizes: [one('bunch', 'bunches')],
    // check: a bunch is about 8 stalks, 100 g, 1 cup sliced.
    to: { whole: 1 / 8, g: 1 / 100, cup: 1 },
    category: PRODUCE,
  },
  {
    id: 'onion',
    names: [exact('onion'), 'yellow onion', 'white onion', 'sweet onion', 'brown onion'],
    measure: 'count', unit: 'each', sizes: LOOSE,
    // A medium onion: about 150 g, 1 cup chopped.
    to: { g: 1 / 150, cup: 1 },
    category: PRODUCE,
  },
  {
    id: 'red-onion',
    names: ['red onion', 'purple onion'],
    measure: 'count', unit: 'each', sizes: LOOSE,
    to: { g: 1 / 150, cup: 1 },
    category: PRODUCE,
  },
  {
    id: 'shallot',
    names: ['shallot'],
    measure: 'count', unit: 'each', sizes: LOOSE,
    // check: a shallot is about 40 g, 3 tbsp minced.
    to: { g: 1 / 40, tbsp: 1 / 3 },
    category: PRODUCE,
  },
  {
    id: 'garlic',
    display: 'garlic',
    names: [exact('garlic'), 'garlic clove', 'clove garlic', 'clove of garlic', scaled('head of garlic', 10), scaled('garlic head', 10), scaled('garlic bulb', 10)],
    measure: 'count', unit: 'head', sizes: [one('head', 'heads')],
    // "whole" is a clove; a head is about 10 cloves (50 g); a clove is about 1 tsp minced.
    to: { whole: 1 / 10, clove: 1 / 10, g: 1 / 50, tsp: 1 / 10 },
    category: PRODUCE,
  },
  {
    id: 'ginger',
    names: [exact('ginger'), 'ginger root', 'gingerroot'],
    measure: 'count', unit: 'piece', sizes: [one('piece', 'pieces')],
    // check: a thumb-size piece is about 1 tbsp minced, 15 g.
    to: { whole: 1, tbsp: 1, g: 1 / 15 },
    category: PRODUCE,
  },
  {
    id: 'red-bell-pepper',
    names: ['red bell pepper', exact('red pepper'), 'red capsicum'],
    measure: 'count', unit: 'each', sizes: LOOSE,
    // A medium bell pepper: about 165 g, 1¼ cups chopped.
    to: { g: 1 / 165, cup: 1 / 1.25 },
    category: PRODUCE,
  },
  {
    id: 'green-bell-pepper',
    names: ['green bell pepper', exact('green pepper')],
    measure: 'count', unit: 'each', sizes: LOOSE,
    to: { g: 1 / 165, cup: 1 / 1.25 },
    category: PRODUCE,
  },
  {
    id: 'bell-pepper',
    names: ['bell pepper', 'capsicum'],
    measure: 'count', unit: 'each', sizes: LOOSE,
    to: { g: 1 / 165, cup: 1 / 1.25 },
    category: PRODUCE,
  },
  {
    id: 'jalapeno',
    names: ['jalapeno', 'jalapeno pepper'],
    measure: 'count', unit: 'each', sizes: LOOSE,
    // check: about 14 g each.
    to: { g: 1 / 14 },
    category: PRODUCE,
  },
  {
    id: 'sweet-potato',
    names: ['sweet potato'],
    measure: 'count', unit: 'each', sizes: LOOSE,
    // check: a medium sweet potato is about 200 g, 1⅓ cups cubed.
    to: { g: 1 / 200, cup: 1 / 1.33 },
    category: PRODUCE,
  },
  {
    id: 'lemon',
    display: 'lemon',
    names: [exact('lemon'), 'lemon juice', scaled('lemon zest', 3), scaled('lemon wedge', 1 / 6)],
    measure: 'count', unit: 'each', sizes: LOOSE,
    // A lemon gives about 3 tbsp juice (and 1 tbsp zest); 6 wedges.
    to: { tbsp: 1 / 3 },
    category: PRODUCE,
  },
  {
    id: 'apple',
    names: ['apple', 'red apple', 'green apple', 'gala apple', 'granny smith apple', 'honeycrisp apple', 'fuji apple'],
    measure: 'count', unit: 'each', sizes: LOOSE,
    // A medium apple: about 180 g, 1¼ cups chopped.
    to: { g: 1 / 180, cup: 1 / 1.25 },
    category: PRODUCE,
  },
  {
    id: 'cilantro',
    names: ['cilantro', 'coriander leaf'],
    measure: 'count', unit: 'bunch', sizes: [one('bunch', 'bunches')],
    // check: a bunch is about 1½ cups chopped leaves, 60 g.
    to: { whole: 1, cup: 1 / 1.5, g: 1 / 60 },
    category: PRODUCE,
  },
  {
    id: 'dill',
    names: [exact('dill'), 'dill weed', 'fresh dill'],
    measure: 'count', unit: 'bunch', sizes: [one('bunch', 'bunches')],
    // check: a bunch is about 1 cup chopped, 30 g. A tsp of dill may mean dried.
    to: { whole: 1, cup: 1, g: 1 / 30 },
    category: PRODUCE,
  },
  {
    id: 'basil',
    names: [exact('basil'), 'basil leaf', 'fresh basil'],
    measure: 'weight', unit: 'oz', sizes: [oz(0.75, '0.75 oz pack'), oz(2, '2 oz pack')],
    // check: 1 cup of leaves weighs about 0.7 oz. A tsp of basil may mean dried.
    to: { cup: 0.7 },
    category: PRODUCE,
  },
  {
    id: 'kale',
    names: ['kale', 'lacinato kale', 'curly kale', 'tuscan kale'],
    measure: 'count', unit: 'bunch', sizes: [one('bunch', 'bunches')],
    // check: a bunch is about 6 cups chopped, 250 g.
    to: { whole: 1, cup: 1 / 6, g: 1 / 250 },
    category: PRODUCE,
  },
  {
    id: 'broccolini',
    names: ['broccolini', 'baby broccoli'],
    measure: 'count', unit: 'bunch', sizes: [one('bunch', 'bunches')],
    // check: a bunch is about 8 oz (227 g).
    to: { whole: 1, g: 1 / 227 },
    category: PRODUCE,
  },
  {
    id: 'carrot',
    names: [exact('carrot'), 'carrot stick', 'shredded carrot'],
    measure: 'weight', unit: 'oz', sizes: [lb(1, '1 lb bag'), lb(2, '2 lb bag')],
    // check: a medium carrot is about 2.1 oz; 1 cup chopped about 4.5 oz.
    to: { whole: 2.1, cup: 4.5 },
    category: PRODUCE,
  },
  {
    id: 'green-bean',
    names: ['green bean', 'string bean', 'haricot vert'],
    measure: 'weight', unit: 'oz', sizes: [oz(12, '12 oz bag'), lb(1), lb(2)],
    // 1 cup cut is about 3.9 oz.
    to: { cup: 3.9 },
    category: PRODUCE,
  },
  {
    id: 'shredded-cabbage',
    names: ['shredded cabbage', 'coleslaw mix', 'cole slaw mix', 'slaw mix'],
    measure: 'weight', unit: 'oz', sizes: [oz(14, '14 oz bag')],
    // check: 1 cup shredded is about 2.5 oz.
    to: { cup: 2.5 },
    category: PRODUCE,
  },

  // ── Meat
  {
    id: 'ground-beef',
    names: ['ground beef', 'lean ground beef', 'extra lean ground beef', 'ground chuck'],
    measure: 'weight', unit: 'oz', sizes: [lb(1), lb(2), lb(3)],
    category: MEAT,
  },
  {
    id: 'ground-pork',
    names: ['ground pork'],
    measure: 'weight', unit: 'oz', sizes: [lb(1)],
    category: MEAT,
  },
  {
    id: 'ground-chicken',
    names: ['ground chicken'],
    measure: 'weight', unit: 'oz', sizes: [lb(1)],
    category: MEAT,
  },

  // ── Dairy and eggs
  {
    id: 'egg',
    names: ['egg', 'whole egg'],
    measure: 'count', unit: 'egg',
    sizes: [{ size: 6, label: '½ dozen' }, { size: 12, label: '1 dozen', plural: 'dozen' }, { size: 18, label: '18 eggs' }],
    // A large egg is about 50 g out of the shell.
    to: { whole: 1, g: 1 / 50 },
    category: DAIRY,
  },
  {
    id: 'milk',
    names: [exact('milk'), 'whole milk', '2% milk', '1% milk', 'skim milk', 'low fat milk', 'reduced fat milk', 'nonfat milk', 'dairy milk'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(32, '1 quart'), floz(64, '½ gallon'), floz(128, '1 gallon')],
    to: { g: 8 / 244 },
    category: DAIRY,
  },
  {
    id: 'heavy-cream',
    names: ['heavy cream', 'heavy whipping cream', 'whipping cream', exact('cream')],
    measure: 'volume', unit: 'fl oz', sizes: [floz(8, '½ pint'), floz(16, '1 pint'), floz(32, '1 quart')],
    to: { g: 8 / 238 },
    category: DAIRY,
  },
  {
    id: 'sour-cream',
    names: ['sour cream'],
    measure: 'weight', unit: 'oz', sizes: [oz(8), oz(16)],
    to: { cup: 8.1 },
    category: DAIRY,
  },
  {
    id: 'cream-cheese',
    names: ['cream cheese'],
    measure: 'weight', unit: 'oz', sizes: [oz(8, '8 oz block')],
    to: { cup: 8 },
    category: DAIRY,
  },
  {
    id: 'butter',
    names: [exact('butter'), 'unsalted butter', 'salted butter'],
    measure: 'weight', unit: 'oz', sizes: [oz(8, '8 oz (2 sticks)'), lb(1, '1 lb (4 sticks)')],
    // 1 cup = 2 sticks = 8 oz; 1 tbsp = 0.5 oz.
    to: { cup: 8 },
    category: DAIRY,
  },
  {
    id: 'greek-yogurt',
    names: ['greek yogurt'],
    measure: 'weight', unit: 'oz', sizes: [oz(5.3, '5.3 oz cup'), oz(16, '16 oz tub'), oz(32, '32 oz tub')],
    to: { cup: 8.6 },
    category: DAIRY,
  },
  {
    id: 'plain-yogurt',
    names: ['plain yogurt', exact('yogurt'), 'whole milk yogurt'],
    measure: 'weight', unit: 'oz', sizes: [oz(6, '6 oz cup'), oz(32, '32 oz tub')],
    to: { cup: 8.6 },
    category: DAIRY,
  },
  {
    id: 'feta',
    names: ['feta', 'feta cheese'],
    measure: 'weight', unit: 'oz', sizes: [oz(4), oz(6), oz(8)],
    // check: 1 cup crumbled is about 5 oz.
    to: { cup: 5 },
    category: DAIRY,
  },
  {
    id: 'parmesan',
    names: ['parmesan', 'parmesan cheese', 'parmigiano reggiano'],
    measure: 'weight', unit: 'oz', sizes: [oz(5), oz(8)],
    // check: 1 cup grated is about 3 oz (1 tbsp about 5 g).
    to: { cup: 3 },
    category: DAIRY,
  },
  {
    id: 'ricotta',
    names: ['ricotta', 'ricotta cheese', 'whole milk ricotta'],
    measure: 'weight', unit: 'oz', sizes: [oz(15, '15 oz tub'), oz(32, '32 oz tub')],
    to: { cup: 8.8 },
    category: DAIRY,
  },
  {
    id: 'shredded-cheese',
    names: ['shredded cheese', 'shredded mexican cheese', 'mexican blend cheese', 'mexican cheese blend', 'shredded mexican blend cheese'],
    measure: 'weight', unit: 'oz', sizes: [oz(8, '8 oz bag'), oz(16, '16 oz bag')],
    // 1 cup shredded is about 4 oz.
    to: { cup: 4 },
    category: DAIRY,
  },

  // ── Grains and bread
  {
    id: 'rice',
    display: 'rice',
    names: [
      exact('rice'), 'white rice', 'long grain rice', 'long grain white rice', 'jasmine rice', 'basmati rice',
      scaled('cooked rice', 1 / 3), scaled('cooked white rice', 1 / 3), scaled('cooked jasmine rice', 1 / 3), scaled('steamed rice', 1 / 3),
    ],
    measure: 'weight', unit: 'oz', sizes: [lb(2, '2 lb bag'), lb(5, '5 lb bag')],
    // 1 cup dry is about 6.5 oz; cooked rice is about 3 times its dry volume.
    to: { cup: 6.5 },
    category: GRAINS,
  },
  {
    id: 'brown-rice',
    display: 'brown rice',
    names: ['brown rice', 'long grain brown rice', scaled('cooked brown rice', 1 / 3)],
    measure: 'weight', unit: 'oz', sizes: [lb(2, '2 lb bag')],
    // check: 1 cup dry is about 6.7 oz (190 g).
    to: { cup: 6.7 },
    category: GRAINS,
  },
  {
    id: 'english-muffin',
    names: ['english muffin'],
    measure: 'count', unit: 'muffin', sizes: [{ size: 6, label: '6-pack' }],
    // check: sold 6 to a pack (some brands also sell 4 or 12).
    category: GRAINS,
  },
  {
    id: 'sandwich-bread',
    names: ['white bread', 'sandwich bread', exact('bread'), 'bread slice', 'slice of bread'],
    measure: 'count', unit: 'loaf', sizes: [one('loaf', 'loaves')],
    // check: a 20 oz sandwich loaf is about 20 slices (28 g each); "whole" is a slice.
    to: { slice: 1 / 20, whole: 1 / 20, g: 1 / 560 },
    category: GRAINS,
  },
  {
    id: 'panko',
    names: ['panko', 'panko breadcrumb', 'panko bread crumb'],
    measure: 'weight', unit: 'oz', sizes: [oz(8)],
    // check: 1 cup is about 1.9 oz.
    to: { cup: 1.9 },
    category: GRAINS,
  },
  {
    id: 'macaroni',
    names: ['macaroni', 'elbow macaroni', 'elbow pasta', 'macaroni pasta'],
    measure: 'weight', unit: 'oz', sizes: [lb(1, '1 lb box')],
    // 1 cup dry is about 3.7 oz.
    to: { cup: 3.7 },
    category: GRAINS,
  },
  {
    id: 'lo-mein-noodles',
    names: ['lo mein noodle', 'lo mein'],
    measure: 'weight', unit: 'oz', sizes: [oz(8), oz(16)],
    category: GRAINS,
  },
  {
    id: 'flour',
    names: ['all purpose flour', exact('flour'), 'ap flour', 'plain flour', 'white flour', 'unbleached all purpose flour'],
    measure: 'weight', unit: 'oz', sizes: [lb(2, '2 lb bag'), lb(5, '5 lb bag')],
    // 1 cup is about 4.25 oz (120 g).
    to: { cup: 4.25 },
    staple: true,
    category: GRAINS,
  },

  // ── Canned and pantry
  {
    id: 'chickpeas',
    names: ['chickpea', 'garbanzo bean', 'canned chickpea'],
    measure: 'weight', unit: 'oz', sizes: [oz(15, '15 oz can')],
    // oz and g are the can's net weight; "can" / "whole" is a 15 oz can.
    // check: a 15 oz can drains to about 1½ cups.
    to: { whole: 15, can: 15, cup: 10 },
    category: PANTRY,
  },
  {
    id: 'crushed-tomatoes',
    names: ['crushed tomato', 'canned crushed tomato'],
    measure: 'weight', unit: 'oz', sizes: [oz(14.5, '14.5 oz can'), oz(28, '28 oz can')],
    // "can" / "whole" is the 28 oz can recipes usually mean; 1 cup is about 8.5 oz.
    to: { whole: 28, can: 28, cup: 8.5 },
    category: PANTRY,
  },
  {
    id: 'coconut-milk',
    names: ['coconut milk', 'light coconut milk', 'full fat coconut milk'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(13.5, '13.5 fl oz can')],
    // "can" / "whole" is a 13.5 oz can; oz and g are its net contents (about 400 g).
    to: { whole: 13.5, can: 13.5, oz: 1, g: 13.5 / 400 },
    category: PANTRY,
  },
  {
    id: 'broth',
    names: [exact('broth'), exact('stock')],
    measure: 'volume', unit: 'fl oz', sizes: [floz(14.5, '14.5 oz can'), floz(32, '32 oz carton')],
    // "can" / "whole" is a 14.5 oz can; oz and g are its net contents (about 411 g).
    to: { can: 14.5, whole: 14.5, oz: 1, g: 14.5 / 411 },
    category: PANTRY,
  },
  {
    id: 'chicken-broth',
    names: ['chicken broth', 'chicken stock'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(14.5, '14.5 oz can'), floz(32, '32 oz carton')],
    // "can" / "whole" is a 14.5 oz can; oz and g are its net contents (about 411 g).
    to: { can: 14.5, whole: 14.5, oz: 1, g: 14.5 / 411 },
    category: PANTRY,
  },
  {
    id: 'beef-broth',
    names: ['beef broth', 'beef stock'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(14.5, '14.5 oz can'), floz(32, '32 oz carton')],
    // "can" / "whole" is a 14.5 oz can; oz and g are its net contents (about 411 g).
    to: { can: 14.5, whole: 14.5, oz: 1, g: 14.5 / 411 },
    category: PANTRY,
  },
  {
    id: 'vegetable-broth',
    names: ['vegetable broth', 'vegetable stock', 'veggie broth'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(14.5, '14.5 oz can'), floz(32, '32 oz carton')],
    // "can" / "whole" is a 14.5 oz can; oz and g are its net contents (about 411 g).
    to: { can: 14.5, whole: 14.5, oz: 1, g: 14.5 / 411 },
    category: PANTRY,
  },
  {
    id: 'soy-sauce',
    names: ['soy sauce', 'tamari'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(10), floz(15)],
    // 1 tbsp is about 15 g.
    to: { g: 8 / 240 },
    category: PANTRY,
  },
  {
    id: 'oyster-sauce',
    names: ['oyster sauce'],
    measure: 'weight', unit: 'oz', sizes: [oz(9), oz(18)],
    // check: 1 tbsp is about 16 g, so 1 cup about 9 oz.
    to: { cup: 9 },
    category: PANTRY,
  },
  {
    id: 'rice-vinegar',
    names: ['rice vinegar', 'rice wine vinegar', 'seasoned rice vinegar'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(12)],
    to: { g: 8 / 240 },
    category: PANTRY,
  },
  {
    id: 'honey',
    names: ['honey'],
    measure: 'weight', unit: 'oz', sizes: [oz(12), oz(16), oz(32)],
    // 1 cup is about 12 oz (340 g).
    to: { cup: 12 },
    category: PANTRY,
  },
  {
    id: 'gochujang',
    names: ['gochujang', 'gochujang paste', 'korean chili paste'],
    measure: 'weight', unit: 'oz', sizes: [oz(8.8, '8.8 oz tub'), oz(17.6, '17.6 oz tub')],
    // check: 1 tbsp is about 15 g, so 1 cup about 8.5 oz.
    to: { cup: 8.5 },
    category: PANTRY,
  },
  {
    id: 'sriracha',
    names: ['sriracha', 'sriracha sauce'],
    measure: 'weight', unit: 'oz', sizes: [oz(9), oz(17), oz(28)],
    // check: 1 cup is about 9.3 oz.
    to: { cup: 9.3 },
    category: PANTRY,
  },
  {
    id: 'chili-crisp',
    names: ['chili crisp', 'chili oil', 'chili garlic oil', 'crunchy chili garlic oil', 'chili onion crunch'],
    measure: 'weight', unit: 'oz', sizes: [oz(6, '6 oz jar'), oz(7.4, '7.4 oz jar')],
    // check: 1 tbsp is about 15 g, so 1 cup about 8.5 oz.
    to: { cup: 8.5 },
    category: PANTRY,
  },
  {
    id: 'mayonnaise',
    names: ['mayonnaise', 'mayo'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(15), floz(30)],
    to: { g: 8 / 220 },
    category: PANTRY,
  },
  {
    id: 'peanut-butter',
    names: ['peanut butter', 'creamy peanut butter', 'crunchy peanut butter', 'natural peanut butter'],
    measure: 'weight', unit: 'oz', sizes: [oz(16, '16 oz jar'), oz(28, '28 oz jar'), oz(40, '40 oz jar')],
    // 1 tbsp is about 16 g, so 1 cup about 9 oz.
    to: { cup: 9 },
    category: PANTRY,
  },
  {
    id: 'sesame-seeds',
    names: ['sesame seed', 'toasted sesame seed', 'white sesame seed'],
    measure: 'weight', unit: 'oz', sizes: [oz(3.5, '3.5 oz bag')],
    // check: the size (spice-aisle jars run about 2–4 oz); 1 tbsp is about 9 g.
    to: { cup: 5 },
    category: PANTRY,
  },
  {
    id: 'chocolate',
    names: [exact('chocolate'), 'chocolate chip', 'semisweet chocolate chip', 'milk chocolate chip', 'dark chocolate chip', 'milk chocolate', 'dark chocolate', 'semisweet chocolate', 'bittersweet chocolate'],
    measure: 'weight', unit: 'oz', sizes: [oz(4, '4 oz bar'), oz(12, '12 oz bag')],
    // check: 1 cup chopped or chips is about 6 oz.
    to: { cup: 6 },
    category: PANTRY,
  },

  // ── Frozen
  {
    id: 'frozen-blueberries',
    names: ['frozen blueberry', 'frozen wild blueberry', 'wild blueberry'],
    measure: 'weight', unit: 'oz', sizes: [oz(10, '10 oz bag'), oz(16, '16 oz bag'), oz(32, '32 oz bag')],
    // check: 1 cup frozen is about 5.3 oz.
    to: { cup: 5.3 },
    category: FROZEN,
  },

  // ── Staples
  {
    id: 'salt',
    names: [exact('salt'), 'kosher salt', 'sea salt', 'table salt', 'fine sea salt', 'flaky sea salt', exact('salt and pepper')],
    measure: 'weight', unit: 'oz', sizes: [], staple: true, category: PANTRY,
  },
  {
    id: 'black-pepper',
    names: ['black pepper', exact('pepper'), 'ground black pepper', 'cracked black pepper', 'black peppercorn'],
    measure: 'weight', unit: 'oz', sizes: [], staple: true, category: PANTRY,
  },
  {
    id: 'olive-oil',
    names: ['olive oil', 'extra virgin olive oil'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(16.9, '500 ml bottle'), floz(25.4, '750 ml bottle'), floz(33.8, '1 L bottle')],
    // 1 tbsp is about 13.5 g.
    to: { g: 8 / 216 },
    staple: true, category: PANTRY,
  },
  {
    id: 'vegetable-oil',
    names: [exact('oil'), 'vegetable oil', 'canola oil', 'neutral oil', 'cooking oil'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(48)],
    to: { g: 8 / 218 },
    staple: true, category: PANTRY,
  },
  {
    id: 'avocado-oil',
    names: ['avocado oil'],
    measure: 'volume', unit: 'fl oz', sizes: [floz(16.9, '500 ml bottle'), floz(33.8, '1 L bottle')],
    // check: sold in 500 ml and 1 L bottles.
    to: { g: 8 / 218 },
    staple: true, category: PANTRY,
  },
  {
    id: 'cooking-spray',
    names: ['cooking spray', 'nonstick cooking spray', 'nonstick spray', 'oil spray'],
    measure: 'count', unit: 'each', sizes: [], staple: true, category: PANTRY,
  },
  {
    id: 'sugar',
    names: [exact('sugar'), 'granulated sugar', 'white sugar', 'cane sugar', 'granulated cane sugar'],
    measure: 'weight', unit: 'oz', sizes: [lb(4, '4 lb bag')],
    // 1 cup is about 7 oz (200 g).
    to: { cup: 7 },
    staple: true, category: PANTRY,
  },
  {
    id: 'brown-sugar',
    names: ['brown sugar', 'light brown sugar', 'dark brown sugar'],
    measure: 'weight', unit: 'oz', sizes: [lb(2, '2 lb bag')],
    // check: a 2 lb bag; 1 cup packed is about 7.5 oz (213 g).
    to: { cup: 7.5 },
    staple: true, category: PANTRY,
  },
  {
    id: 'powdered-sugar',
    names: ['powdered sugar', 'confectioners sugar', 'icing sugar'],
    measure: 'weight', unit: 'oz', sizes: [lb(2, '2 lb bag')],
    // check: a 2 lb bag; 1 cup is about 4.25 oz (120 g).
    to: { cup: 4.25 },
    staple: true, category: PANTRY,
  },
  {
    id: 'baking-soda',
    names: ['baking soda', 'bicarbonate of soda'],
    measure: 'weight', unit: 'oz', sizes: [lb(1, '1 lb box')],
    // 1 tsp is about 4.6 g.
    to: { tsp: 4.6 / 28.3495 },
    staple: true, category: PANTRY,
  },
  {
    id: 'baking-powder',
    names: ['baking powder'],
    measure: 'weight', unit: 'oz', sizes: [oz(8.1, '8.1 oz can')],
    // 1 tsp is about 4 g.
    to: { tsp: 4 / 28.3495 },
    staple: true, category: PANTRY,
  },
  {
    id: 'vanilla',
    names: ['vanilla extract', 'pure vanilla extract', exact('vanilla')],
    measure: 'volume', unit: 'fl oz', sizes: [floz(1), floz(2)],
    staple: true, category: PANTRY,
  },
  spice('garlic-powder', ['garlic powder', 'granulated garlic']),
  spice('onion-powder', ['onion powder']),
  spice('paprika', ['paprika', 'smoked paprika', 'sweet paprika']),
  spice('chili-powder', ['chili powder']),
  spice('cinnamon', ['cinnamon', 'ground cinnamon']),
  spice('cumin', ['cumin', 'ground cumin']),
  spice('herbes-de-provence', ['herbes de provence', 'herbs de provence']),
  spice('gochugaru', ['gochugaru', 'korean chili flake', 'korean red pepper flake']),
  spice('red-pepper-flakes', ['red pepper flake', 'crushed red pepper', 'crushed red pepper flake', 'chili flake']),
  spice('white-pepper', ['white pepper', 'ground white pepper']),
  // Dried herbs (staples). Also what a tsp of the herb means (driedHerb).
  ...['dill', 'basil', 'oregano', 'thyme', 'parsley', 'rosemary', 'cilantro', 'sage', 'tarragon', 'mint'].map((herb) => ({
    ...spice(`dried-${herb}`, [`dried ${herb}`, `dried ${herb} leaf`, `${herb} flake`]),
    display: `dried ${herb}`,
    driedHerb: herb,
  })),

  // ── Never on the list
  { id: 'water', names: [exact('water'), 'hot water', 'boiling water', 'ice water', 'tap water'], measure: 'volume', unit: 'fl oz', sizes: [], skip: true, category: 'Beverages' },
  { id: 'ice', names: [exact('ice'), 'ice cube'], measure: 'count', unit: 'each', sizes: [], skip: true, category: 'Other' },
]
