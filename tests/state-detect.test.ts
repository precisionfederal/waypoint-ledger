/* ==========================================================================
   READING THE PLACE OUT OF THE STORY — the tests that make it safe to prefill.

   A prefilled answer is a claim about somebody's life. It is allowed here only
   because three things are proved below:
   1. Every one of the 50 states, DC, and the 60 largest cities is recognised
      from the way a person actually writes it.
   2. A word that is two places at once ("Washington", "Kansas City") produces
      a QUESTION, never a state — and a word that only looks like a state code
      ("I was ok", "it was in me", "Mississippi River", "Indiana Jones")
      produces nothing at all.
   3. Every state CMS prices resolves to at least one published locality, so a
      detected state can always be fitted to a published figure.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { detectState, localityForCity, localityForState, placeOnlyPhrase } from '@/lib/state-detect';
import { LOCALITIES, STATES, STATE_NAME, localityOf, soleLocality } from '@/lib/fit';

const CODES_50_DC = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
  'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT',
  'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

describe('every state and DC, written out by name', () => {
  for (const code of CODES_50_DC) {
    const name = STATE_NAME[code];
    it(`reads "${name}"`, () => {
      // Washington the bare word is deliberately a question, so it is asked as
      // people actually disambiguate it.
      const story = code === 'WA' ? 'I live in Washington state' : `I live in ${name}`;
      const d = detectState(story);
      expect(d.state?.code).toBe(code);
      expect(d.ask).toBeNull();
    });
  }
});

describe('the state name is read wherever it sits in the sentence', () => {
  const cases: [string, string][] = [
    ['Iowa is where all of this happened.', 'IA'],
    ['three ER visits, two MRIs, all in Ohio', 'OH'],
    ['after we moved to Vermont it got worse', 'VT'],
    ['my primary care is in North Dakota now', 'ND'],
    ['everything since 2021 has been South Carolina', 'SC'],
    ['I had the first scan in Rhode Island and the second one later', 'RI'],
    ['New Hampshire, then Maine, then nothing for a year', 'NH'],
    ['west virginia is where the neurologist is', 'WV'],
    ['NEW MEXICO for all of it', 'NM'],
    ['I have lived in Puerto Rico the whole time', 'PR'],
  ];
  for (const [story, code] of cases) {
    it(`"${story.slice(0, 44)}" -> ${code}`, () => {
      expect(detectState(story).state?.code).toBe(code);
    });
  }
});

describe('West Virginia beats Virginia, New York beats York, Kansas City beats Kansas', () => {
  it('west virginia is not virginia', () => {
    expect(detectState('I live in West Virginia').state?.code).toBe('WV');
  });
  it('virginia on its own is virginia', () => {
    expect(detectState('I live in Virginia').state?.code).toBe('VA');
  });
  it('new mexico is not mexico', () => {
    expect(detectState('I live in New Mexico').state?.code).toBe('NM');
  });
  it('kansas city does not read as kansas', () => {
    const d = detectState('I live in Kansas City');
    expect(d.state).toBeNull();
    expect(d.ask?.candidates.map((c) => c.code)).toEqual(['MO', 'KS']);
  });
  it('kansas on its own is kansas', () => {
    expect(detectState('I live in Kansas').state?.code).toBe('KS');
  });
});

describe('the postal code, only when it cannot be a word', () => {
  const yes: [string, string][] = [
    ['I live in TX', 'TX'],
    ['I live in tx', 'TX'],
    ['We moved to NV last year', 'NV'],
    ['Ames, IA 50010', 'IA'],
    ['Houston, TX 77002', 'TX'],
    ['everything happened in NY', 'NY'],
    ['Cheyenne, WY', 'WY'],
    ['the clinic was in NC', 'NC'],
    ['I live in OK', 'OK'],
    ['I have lived in ME my whole life', 'ME'],
    ['based in DC since 2019', 'DC'],
    ['I live in CT', 'CT'],
  ];
  for (const [story, code] of yes) {
    it(`"${story}" -> ${code}`, () => expect(detectState(story).state?.code).toBe(code));
  }

  const no: string[] = [
    'I was ok for a while',
    'the pain was in me for months',
    'it was OK for a while but then it was not',
    'I went in or out of the clinic all year',
    'she told me to go in and wait',
    'the swelling was in my hand',
    'I said hi to the nurse',
    'that is my id number',
    'it hurt so I called in',
    'I am not sure if it was la grippe',
    'they ran the test to me twice',
  ];
  for (const story of no) {
    it(`"${story}" names no state`, () => expect(detectState(story).state).toBeNull());
  }
});

describe('the 60 largest cities', () => {
  const cases: [string, string][] = [
    ['New York', 'NY'], ['Los Angeles', 'CA'], ['Chicago', 'IL'], ['Houston', 'TX'],
    ['Phoenix', 'AZ'], ['Philadelphia', 'PA'], ['San Antonio', 'TX'], ['San Diego', 'CA'],
    ['Dallas', 'TX'], ['Jacksonville', 'FL'], ['Austin', 'TX'], ['Fort Worth', 'TX'],
    ['San Jose', 'CA'], ['Columbus', 'OH'], ['Charlotte', 'NC'], ['Indianapolis', 'IN'],
    ['San Francisco', 'CA'], ['Seattle', 'WA'], ['Denver', 'CO'], ['Oklahoma City', 'OK'],
    ['Nashville', 'TN'], ['El Paso', 'TX'], ['Las Vegas', 'NV'], ['Boston', 'MA'],
    ['Detroit', 'MI'], ['Louisville', 'KY'], ['Memphis', 'TN'], ['Baltimore', 'MD'],
    ['Milwaukee', 'WI'], ['Albuquerque', 'NM'], ['Fresno', 'CA'], ['Tucson', 'AZ'],
    ['Sacramento', 'CA'], ['Mesa', 'AZ'], ['Atlanta', 'GA'], ['Omaha', 'NE'],
    ['Colorado Springs', 'CO'], ['Raleigh', 'NC'], ['Virginia Beach', 'VA'],
    ['Long Beach', 'CA'], ['Miami', 'FL'], ['Oakland', 'CA'], ['Minneapolis', 'MN'],
    ['Bakersfield', 'CA'], ['Tulsa', 'OK'], ['Tampa', 'FL'], ['Arlington', 'TX'],
    ['Wichita', 'KS'], ['Aurora', 'CO'], ['New Orleans', 'LA'], ['Cleveland', 'OH'],
    ['Anaheim', 'CA'], ['Honolulu', 'HI'], ['Riverside', 'CA'], ['Santa Ana', 'CA'],
    ['Corpus Christi', 'TX'], ['St. Louis', 'MO'], ['Pittsburgh', 'PA'],
    ['Salt Lake City', 'UT'], ['Boise', 'ID'], ['Des Moines', 'IA'], ['Anchorage', 'AK'],
    ['Sioux Falls', 'SD'], ['Fargo', 'ND'], ['Billings', 'MT'], ['Burlington', 'VT'],
    ['Providence', 'RI'], ['Manchester', 'NH'], ['Wilmington', 'DE'], ['Bridgeport', 'CT'],
    ['Little Rock', 'AR'], ['Birmingham', 'AL'], ['Newark', 'NJ'], ['Santa Fe', 'NM'],
  ];
  for (const [city, code] of cases) {
    it(`"I live in ${city}" -> ${code}`, () => {
      const d = detectState(`I live in ${city}`);
      expect(d.state?.code).toBe(code);
      expect(d.state?.kind).toBe('city');
    });
  }
});

describe('a city that is really two cities is a question, never a guess', () => {
  const asks: [string, string[]][] = [
    ['I live in Washington', ['WA', 'DC']],
    ['I live in Kansas City', ['MO', 'KS']],
    ['I live in Springfield', ['IL', 'MO', 'MA']],
    ['I live in Charleston', ['SC', 'WV']],
    ['I live in Columbia', ['SC', 'MO']],
    ['I live in Portland', ['OR', 'ME']],
  ];
  for (const [story, codes] of asks) {
    it(`"${story}" asks ${codes.join('/')}`, () => {
      const d = detectState(story);
      expect(d.state).toBeNull();
      expect(d.ask?.candidates.map((c) => c.code)).toEqual(codes);
      expect(d.ask?.why.length).toBeGreaterThan(10);
    });
  }
  it('Washington, D.C. is the district', () => {
    expect(detectState('I live in Washington, D.C.').state?.code).toBe('DC');
  });
  it('Washington DC without the periods is the district', () => {
    expect(detectState('I live in Washington DC').state?.code).toBe('DC');
  });
  it('Washington state is the state', () => {
    expect(detectState('I live in Washington state').state?.code).toBe('WA');
  });
  it('Seattle settles Washington', () => {
    const d = detectState('I live in Seattle, Washington');
    expect(d.state?.code).toBe('WA');
    expect(d.ask).toBeNull();
  });
  it('Portland with Maine named is Maine', () => {
    expect(detectState('I live in Portland, Maine').state?.code).toBe('ME');
  });
  it('Springfield with Illinois named is Illinois', () => {
    expect(detectState('I live in Springfield, Illinois').state?.code).toBe('IL');
  });
  it('an ambiguous word somebody else lives in does not derail the story', () => {
    const d = detectState('I live in Iowa; my sister is in Washington');
    expect(d.state?.code).toBe('IA');
    expect(d.ask).toBeNull();
  });
});

describe('the traps', () => {
  const nothing: string[] = [
    'I grew up near the Mississippi River',
    'we drove along the Missouri River that summer',
    'the Colorado River trip was the last time I felt fine',
    'my son will not stop watching Indiana Jones',
    'I read it in the Washington Post',
    'it was in the New York Times',
    'the appointment was on Washington Street',
    'the office is on Georgia Ave',
    'my sister Virginia came with me',
    'my aunt Georgia drove me there',
    'Dr. Jackson ordered the labs',
    'the nurse called Charlotte took my blood',
    'they sent me to a place on Delaware Avenue',
    'I saw Dr. Dakota for the rash',
  ];
  for (const story of nothing) {
    it(`"${story.slice(0, 46)}" names no state`, () => {
      expect(detectState(story).state).toBeNull();
    });
  }
  it('an empty story is not a place', () => {
    expect(detectState('').state).toBeNull();
    expect(detectState(null).state).toBeNull();
    expect(detectState(undefined).state).toBeNull();
    expect(detectState('   ').all).toEqual([]);
  });
  it('a story with no place at all is not a place', () => {
    const d = detectState('three ER visits, two MRIs, six months of waiting and a lot of copays');
    expect(d.state).toBeNull();
    expect(d.ask).toBeNull();
  });
});

describe('the phrase is kept, so the person can see why', () => {
  it('keeps the exact words it read', () => {
    const d = detectState('after two years I moved to Houston and started over');
    expect(d.state?.phrase).toBe('Houston');
    expect(d.state?.kind).toBe('city');
    expect(d.state?.code).toBe('TX');
  });
  it('keeps the exact state name it read', () => {
    const d = detectState('I live in New Hampshire');
    expect(d.state?.phrase).toBe('New Hampshire');
    expect(d.state?.kind).toBe('name');
  });
  it('keeps the code it read', () => {
    const d = detectState('Cheyenne, WY');
    expect(d.all.some((x) => x.kind === 'postal' && x.phrase === 'WY')).toBe(true);
  });
  it('the phrase is a real slice of the story', () => {
    const story = 'I live in Corpus Christi and drive to Houston for the specialist';
    const d = detectState(story);
    expect(story.slice(d.state!.index, d.state!.index + d.state!.phrase.length)).toBe(d.state!.phrase);
  });
});

describe('where the sentence means it most, wins', () => {
  it('living beats visiting', () => {
    const d = detectState('I live in Iowa but the specialist I saw was in Boston');
    expect(d.state?.code).toBe('IA');
  });
  it('visiting beats a bare mention', () => {
    const d = detectState('Texas came up in the paperwork; I saw the neurologist in Boston');
    expect(d.state?.code).toBe('MA');
  });
  it('the first place wins when nothing else separates them', () => {
    const d = detectState('Denver, then Tulsa');
    expect(d.state?.code).toBe('CO');
  });
  it('a state named twice is still one state', () => {
    const d = detectState('I live in Iowa. Everything was in Iowa.');
    expect(d.state?.code).toBe('IA');
    expect(d.all.every((x) => x.code === 'IA')).toBe(true);
  });
});

describe('the city sharpens the locality inside its own state', () => {
  it('Texas plus Houston gives the Houston locality', () => {
    const d = detectState('I live in Texas, in Houston');
    expect(d.state?.code).toBe('TX');
    expect(d.state?.locality).toBe('TX-18');
    expect(localityOf(d.state!.locality!)?.displayName).toBe('Houston');
  });
  it('Houston with the postal code still gives Houston', () => {
    const d = detectState('Houston, TX 77002');
    expect(d.state?.code).toBe('TX');
    expect(d.state?.locality).toBe('TX-18');
  });
  it('a bare Texas leaves the locality open, because CMS prices Texas in eight', () => {
    const d = detectState('I live in Texas');
    expect(d.state?.code).toBe('TX');
    expect(d.state?.locality).toBeUndefined();
  });
  it('a one-locality state sets its locality outright', () => {
    const d = detectState('I live in Iowa');
    expect(d.state?.locality).toBe(soleLocality('IA')?.key);
    expect(d.state?.locality).toBeTruthy();
  });
});

describe('city to CMS locality, read from the published file only', () => {
  const known: [string, string, string][] = [
    ['Houston', 'TX', 'TX-18'],
    ['Dallas', 'TX', 'TX-11'],
    ['Austin', 'TX', 'TX-31'],
    ['Fort Worth', 'TX', 'TX-28'],
    ['Galveston', 'TX', 'TX-15'],
    ['Chicago', 'IL', 'IL-16'],
    ['Detroit', 'MI', 'MI-01'],
    ['Atlanta', 'GA', 'GA-01'],
    ['Miami', 'FL', 'FL-04'],
    ['New Orleans', 'LA', 'LA-01'],
    ['Manhattan', 'NY', 'NY-01'],
    ['Queens', 'NY', 'NY-04'],
  ];
  for (const [city, code, key] of known) {
    it(`${city} -> ${key}`, () => {
      expect(localityForCity(city, code)).toBe(key);
      expect(localityOf(key)).not.toBeNull();
    });
  }
  const open: [string, string][] = [
    ['New York', 'NY'], ['NYC', 'NY'], ['Brooklyn', 'NY'],
    ['San Francisco', 'CA'], ['San Jose', 'CA'], ['Oakland', 'CA'],
  ];
  for (const [city, code] of open) {
    it(`${city} names no single locality, so the picker asks`, () => {
      expect(localityForCity(city, code)).toBeUndefined();
    });
  }
  it('every locality a city resolves to is a real published key', () => {
    const keys = new Set(LOCALITIES.map((l) => l.key));
    for (const g of STATES) {
      for (const l of g.localities) {
        const back = localityForCity(l.displayName, g.code);
        if (back) expect(keys.has(back)).toBe(true);
      }
    }
  });
});

describe('every state CMS prices resolves to at least one published locality', () => {
  for (const g of STATES) {
    it(`${g.code} has a locality`, () => {
      expect(g.localities.length).toBeGreaterThan(0);
      expect(localityOf(g.localities[0].key)).not.toBeNull();
    });
  }
  it('all 50 states and DC are priced', () => {
    const priced = new Set(STATES.map((g) => g.code));
    const missing = CODES_50_DC.filter((c) => !priced.has(c));
    expect(missing).toEqual([]);
  });
  it('a one-locality state answers localityForState; a many-locality state does not', () => {
    for (const g of STATES) {
      const solo = localityForState(g.code);
      if (g.localities.length === 1) expect(solo).toBe(g.localities[0].key);
      else expect(solo).toBeUndefined();
    }
  });
  it('every detected state code is a state CMS prices', () => {
    const priced = new Set(STATES.map((g) => g.code));
    for (const code of CODES_50_DC) {
      const name = code === 'WA' ? 'Washington state' : STATE_NAME[code];
      const d = detectState(`I live in ${name}`);
      expect(priced.has(d.state!.code)).toBe(true);
    }
  });
});

describe('the way people really type', () => {
  const cases: [string, string][] = [
    ['i live in houston', 'TX'],
    ['I LIVE IN HOUSTON', 'TX'],
    ['i’m in phoenix now', 'AZ'],
    ['moved to denver in 2022, three ER trips since', 'CO'],
    ['2 MRIs, 1 CT, all at a hospital in Cleveland', 'OH'],
    ['six months of PT in Minneapolis and nothing changed', 'MN'],
    ['saw four doctors in Nashville before anyone listened', 'TN'],
    ['er visit, ct scan, then a referral to a specialist in tucson', 'AZ'],
    ['I am from Anchorage and everything is flown out', 'AK'],
    ['living in Fargo, ND', 'ND'],
    ['Milwaukee, WI — three years of this', 'WI'],
    ['we are outside Atlanta', 'GA'],
  ];
  for (const [story, code] of cases) {
    it(`"${story.slice(0, 46)}" -> ${code}`, () => {
      expect(detectState(story).state?.code).toBe(code);
    });
  }
});

describe('the demo sentence', () => {
  const DEMO = 'I saw my primary care doctor four times, had two MRIs, an ER visit, and six months of physical therapy.';
  it('names no place on its own', () => {
    expect(detectState(DEMO).state).toBeNull();
  });
  it('with "I live in Houston" it is Texas, Houston', () => {
    const d = detectState(`${DEMO} I live in Houston.`);
    expect(d.state?.code).toBe('TX');
    expect(d.state?.locality).toBe('TX-18');
    expect(d.state?.phrase).toBe('Houston');
    expect(d.ask).toBeNull();
  });
});

describe('a sentence that only says where is not a line of care', () => {
  const placeOnly = [
    'I live in Houston.',
    'I live in Houston',
    'i live in houston',
    'We moved to Iowa in 2023',
    'in Ames, IA 50010',
    "I'm in Phoenix now",
    'I have lived in Vermont my whole life',
    'from Anchorage',
    'living in Fargo, ND',
    'and I live in New Orleans',
    'I grew up in Cleveland and still live there',
  ];
  for (const p of placeOnly) {
    it(`"${p}" is place only`, () => expect(placeOnlyPhrase(p)).toBe(true));
  }
  const care = [
    'I saw a doctor in Houston',
    'two MRIs in Boston',
    'the ER once in Denver',
    'six months of physical therapy in Iowa',
    'I live with constant pain',
    'saw my primary care doctor four times',
    'an ER visit',
    'I waited eleven months for the neurologist in Seattle',
  ];
  for (const p of care) {
    it(`"${p.slice(0, 44)}" is not place only`, () => expect(placeOnlyPhrase(p)).toBe(false));
  }
  it('an empty phrase is not place only', () => {
    expect(placeOnlyPhrase('')).toBe(false);
    expect(placeOnlyPhrase(null)).toBe(false);
  });
});
