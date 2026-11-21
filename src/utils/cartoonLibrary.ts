export type CartoonCategoryId =
  | 'all'
  | 'president'
  | 'stadium'
  | 'roads'
  | 'citizens'
  | 'flags'
  | 'govt_cars'
  | 'ballot_boxes'
  | 'voters'
  | 'chanting_crowds'
  | 'politicians'
  | 'campaigning'
  | 'dw_satire';

export interface CartoonCategoryMeta {
  id: CartoonCategoryId;
  labelSw: string;
  labelEn: string;
}

export const CARTOON_CATEGORIES: CartoonCategoryMeta[] = [
  { id: 'all', labelSw: 'Zote', labelEn: 'All' },
  { id: 'president', labelSw: 'Rais', labelEn: 'President' },
  { id: 'stadium', labelSw: 'Uwanja wa Mpira', labelEn: 'Stadium' },
  { id: 'roads', labelSw: 'Barabara', labelEn: 'Roads' },
  { id: 'citizens', labelSw: 'Wananchi', labelEn: 'Citizens' },
  { id: 'flags', labelSw: 'Bendera ya Taifa', labelEn: 'National Flag' },
  { id: 'govt_cars', labelSw: 'Magari ya Serikali', labelEn: 'Govt Vehicles' },
  { id: 'ballot_boxes', labelSw: 'Masanduku ya Kura', labelEn: 'Ballot Boxes' },
  { id: 'voters', labelSw: 'Watu Wakipiga Kura', labelEn: 'People Voting' },
  { id: 'chanting_crowds', labelSw: 'Watu Wakiimba Kura', labelEn: 'Chanting Crowds' },
  { id: 'politicians', labelSw: 'Kiongozi Akipiga Siasa', labelEn: 'Doing Politics' },
  { id: 'campaigning', labelSw: 'Kiongozi Akiomba Kura', labelEn: 'Asking for Votes' },
  { id: 'dw_satire', labelSw: 'Sitiari, Bunge & Mabango', labelEn: 'Satire & Signs' },
];

export type CartoonArchetype =
  | 'character_leader'
  | 'character_citizen'
  | 'stadium_scene'
  | 'road_scene'
  | 'flag_scene'
  | 'vehicle_scene'
  | 'ballot_box_scene'
  | 'voter_action_scene'
  | 'crowd_chant_scene'
  | 'building_satire_scene'
  | 'metaphor_prop_scene'
  | 'sign_media_scene';

export interface CartoonVariantConfig {
  archetype: CartoonArchetype;
  pose: string;
  expression: 'confident' | 'pleading' | 'shocked' | 'angry' | 'happy' | 'sneaky' | 'tired';
  headwear: 'none' | 'glasses' | 'dw_glasses' | 'kofia' | 'cap' | 'helmet' | 'crown_sash' | 'bald' | 'headscarf';
  prop: string;
  outfit: string;
  detailLevel: number;
  fxMarks: 'none' | 'sweat' | 'shock' | 'motion' | 'sparkles' | 'anger';
  sceneryMode: number;
}

export interface CartoonAssetDef {
  id: string;
  category: Exclude<CartoonCategoryId, 'all'>;
  titleSw: string;
  titleEn: string;
  keywords: string;
  defaultW: number; // % of canvas width
  defaultH: number; // % of canvas height
  primaryColor: string;
  secondaryColor: string;
  skinColor: string;
  hasEditableLabel: boolean;
  defaultLabelText: string;
  config: CartoonVariantConfig;
}

export interface CartoonSceneItem {
  uid: string;
  assetId: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  rotationDeg: number;
  flipX: boolean;
  opacity: number;
  primaryColor: string;
  secondaryColor: string;
  skinColor: string;
  labelText: string;
  textColor: string;
  strokeWidthScale: number;
  locked: boolean;
}

export interface CartoonSceneCombo {
  id: string;
  titleSw: string;
  titleEn: string;
  descSw: string;
  descEn: string;
  paperTint: string;
  items: Omit<CartoonSceneItem, 'uid'>[];
  bubbles: {
    kind: 'speech' | 'thought' | 'shout' | 'banner';
    text: string;
    xPct: number;
    yPct: number;
    widthPct: number;
    fontSize: number;
    tailSide: 'left' | 'right';
  }[];
}

// ----------------------------------------------------------------------------
// BUILD 570+ DISTINCT, NON-IDENTICAL POLITICAL & EDITORIAL CARTOON ASSETS
// ----------------------------------------------------------------------------
function buildCartoonCatalog(): CartoonAssetDef[] {
  const list: CartoonAssetDef[] = [];
  const push = (item: CartoonAssetDef) => list.push(item);

  const skinTones = ['#7B4626', '#9C623E', '#5A3119', '#B97C52', '#6B3E26'];
  const suitColors = ['#0F172A', '#1E3A8A', '#334155', '#7F1D1D', '#14532D', '#4C1D95'];
  const accentColors = ['#FACC15', '#16A34A', '#DC2626', '#0284C7', '#D97706', '#0EA5E9'];

  // 1. MARAIS (PRESIDENT — 50 distinct pieces)
  const presPoses = [
    { pose: 'podium_speech', sw: 'Rais Akihutubia Kwenye Jukwaa', en: 'President Addressing at Podium', label: 'RAIS' },
    { pose: 'waving_sash', sw: 'Rais Akipunga Mkono na Sash ya Taifa', en: 'President Waving with National Sash', label: 'IKULU' },
    { pose: 'signing_decree', sw: 'Rais Akiweka Saini Mezani', en: 'President Signing Official Decree', label: 'AMRI' },
    { pose: 'cutting_ribbon', sw: 'Rais Akikata Utepe wa Mradi', en: 'President Cutting Project Ribbon', label: 'UZINDUZI' },
    { pose: 'pointing_command', sw: 'Rais Akinyoosha Kidole Kwa Msisitizo', en: 'President Pointing Decisively', label: 'AGIZO' },
    { pose: 'holding_constitution', sw: 'Rais Akishika Katiba ya Nchi', en: 'President Holding Constitution', label: 'KATIBA' },
    { pose: 'saluting_flag', sw: 'Rais Akipokea Heshima za Bendera', en: 'President Saluting at Ceremony', label: 'TAIFA' },
    { pose: 'listening_citizens', sw: 'Rais Akisikiliza Kero za Wananchi', en: 'President Listening to Citizens', label: 'KERO' },
    { pose: 'inspecting_road', sw: 'Rais Akikagua Ujenzi wa Mradi', en: 'President Inspecting Infrastructure', label: 'UKAGUZI' },
    { pose: 'shocked_budget', sw: 'Rais Akishangaa Ripoti ya Fedha (!?)', en: 'President Shocked by Budget Report', label: 'CAG' },
  ];
  const presHeads: CartoonVariantConfig['headwear'][] = ['dw_glasses', 'glasses', 'kofia', 'crown_sash', 'bald'];
  const presExprs: CartoonVariantConfig['expression'][] = ['confident', 'happy', 'shocked', 'angry', 'tired'];
  const presFx: CartoonVariantConfig['fxMarks'][] = ['none', 'sparkles', 'shock', 'sweat', 'motion'];

  presPoses.forEach((p, pi) => {
    for (let v = 0; v < 5; v++) {
      const idx = pi * 5 + v;
      push({
        id: `pres_${pi}_${v}`,
        category: 'president',
        titleSw: `${p.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${p.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `rais president mkuu wa nchi ikulu kiongozi sash suti ${p.sw} ${p.en}`,
        defaultW: 24,
        defaultH: 36,
        primaryColor: suitColors[idx % suitColors.length],
        secondaryColor: accentColors[v % accentColors.length],
        skinColor: skinTones[idx % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: p.label,
        config: {
          archetype: 'character_leader',
          pose: p.pose,
          expression: presExprs[(pi + v) % presExprs.length],
          headwear: presHeads[v % presHeads.length],
          prop: pi % 2 === 0 ? 'mic_stand' : 'scroll',
          outfit: 'presidential_sash',
          detailLevel: v + 1,
          fxMarks: presFx[(pi + v) % presFx.length],
          sceneryMode: v,
        },
      });
    }
  });

  // 2. UWANJA WA MPIRA (FOOTBALL STADIUM & RALLY ARENA — 40 distinct pieces)
  const stadiumVariants = [
    { pose: 'full_pitch', sw: 'Uwanja wa Mpira (Majukwaa & Nyasi)', en: 'Full Football Stadium Pitch', label: 'UWANJA' },
    { pose: 'packed_rally', sw: 'Uwanja Uliojaa Umati wa Mkutano', en: 'Packed Stadium Political Rally', label: 'MKUTANO' },
    { pose: 'night_floodlights', sw: 'Uwanja Wenye Taa za Usiku', en: 'Stadium with Night Floodlights', label: 'TAIFA' },
    { pose: 'campaign_stage', sw: 'Jukwaa Kuu Katikati ya Uwanja', en: 'Main Campaign Stage in Stadium', label: 'KAMPENI' },
    { pose: 'scoreboard_stadium', sw: 'Uwanja & Ubao wa Matokeo', en: 'Stadium with Scoreboard', label: '3 - 0' },
    { pose: 'goalpost_satire', sw: 'Goli la Mpira na Mpira wa Siasa', en: 'Goalpost & Political Football', label: 'GOLI' },
    { pose: 'broken_stadium', sw: 'Uwanja Uliochakaa / Majukwaa Mabovu', en: 'Crumbling Old Stadium Stands', label: 'UKARABATI' },
    { pose: 'vip_pavilion', sw: 'Jukwaa la Viongozi (VIP) Uwanjani', en: 'VIP Pavilion at Stadium', label: 'VIP' },
  ];
  stadiumVariants.forEach((st, si) => {
    for (let v = 0; v < 5; v++) {
      push({
        id: `stadium_${si}_${v}`,
        category: 'stadium',
        titleSw: `${st.sw}${v === 0 ? '' : ` (${v + 1})`}`,
        titleEn: `${st.en}${v === 0 ? '' : ` (${v + 1})`}`,
        keywords: `uwanja mpira stadium pitch umati mkutano goli michezo ${st.sw} ${st.en}`,
        defaultW: 44,
        defaultH: 30,
        primaryColor: ['#16A34A', '#15803D', '#22C55E', '#1E40AF', '#334155'][v],
        secondaryColor: ['#FACC15', '#DC2626', '#2563EB', '#F97316', '#0F172A'][v],
        skinColor: skinTones[v % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: st.label,
        config: {
          archetype: 'stadium_scene',
          pose: st.pose,
          expression: 'confident',
          headwear: 'none',
          prop: v % 2 === 0 ? 'flags' : 'floodlights',
          outfit: 'arena',
          detailLevel: v + 1,
          fxMarks: v === 2 ? 'sparkles' : v === 3 ? 'motion' : 'none',
          sceneryMode: v,
        },
      });
    }
  });

  // 3. BARABARA (ROADS, POTHOLES, BRIDGES & INFRASTRUCTURE — 45 distinct pieces)
  const roadVariants = [
    { pose: 'smooth_highway', sw: 'Barabara Nzuri ya Lami', en: 'Smooth Tarmac Highway', label: 'BARABARA' },
    { pose: 'pothole_road', sw: 'Barabara Yenye Mashimo Makubwa', en: 'Road Full of Deep Potholes', label: 'MASHIMO' },
    { pose: 'muddy_village_road', sw: 'Barabara ya Vumbi na Matope', en: 'Muddy Rural Dirt Road', label: 'MATOPE' },
    { pose: 'bridge_new', sw: 'Daraja Jipya la Kisasa', en: 'Modern Concrete Bridge', label: 'DARAJA' },
    { pose: 'bridge_broken', sw: 'Daraja Lililokatika / Bovu', en: 'Collapsed / Broken Bridge', label: 'HATARI' },
    { pose: 'traffic_jam', sw: 'Msongamano wa Magari Barabarani', en: 'Heavy City Traffic Jam', label: 'FOLENI' },
    { pose: 'police_roadblock', sw: 'Kizuizi cha Polisi Barabarani', en: 'Police Traffic Roadblock', label: 'SIMAMA' },
    { pose: 'zebra_crossing', sw: 'Kivuko cha Watembea & Taa', en: 'Zebra Crossing & Traffic Lights', label: 'KIVUKO' },
    { pose: 'roundabout', sw: 'Barabara ya Mzunguko (Roundabout)', en: 'City Roundabout Intersection', label: 'MZUNGUKO' },
  ];
  roadVariants.forEach((rd, ri) => {
    for (let v = 0; v < 5; v++) {
      push({
        id: `road_${ri}_${v}`,
        category: 'roads',
        titleSw: `${rd.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${rd.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `barabara road lami mashimo potholes daraja foleni mji ${rd.sw} ${rd.en}`,
        defaultW: 48,
        defaultH: 24,
        primaryColor: ['#475569', '#334155', '#78716C', '#64748B', '#1E293B'][v],
        secondaryColor: ['#FACC15', '#DC2626', '#16A34A', '#F97316', '#FFFFFF'][v],
        skinColor: skinTones[v % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: rd.label,
        config: {
          archetype: 'road_scene',
          pose: rd.pose,
          expression: 'confident',
          headwear: 'none',
          prop: v % 2 === 0 ? 'signpost' : 'trees',
          outfit: 'road',
          detailLevel: v + 1,
          fxMarks: ri === 1 || ri === 4 ? 'shock' : 'none',
          sceneryMode: v,
        },
      });
    }
  });

  // 4. WANANCHI (CITIZENS — 65 distinct pieces)
  const citizenTypes = [
    { pose: 'ordinary_citizen', sw: 'Mwananchi wa Kawaida Akishangaa', en: 'Ordinary Citizen Wondering', label: 'MWANANCHI' },
    { pose: 'farmer_hoe', sw: 'Mkulima na Jembe Shambani', en: 'Farmer Holding Hoe', label: 'MKULIMA' },
    { pose: 'market_mama', sw: 'Mama Lishe / Mfanyabiashara wa Soko', en: 'Market Vendor Woman', label: 'SOKO' },
    { pose: 'bodaboda', sw: 'Dereva wa Bodaboda na Kofia Ngumu', en: 'Bodaboda Motorcycle Rider', label: 'BODA' },
    { pose: 'youth_phone', sw: 'Kijana na Simu Akisoma Habari', en: 'Youth Reading News on Phone', label: 'VIJANA' },
    { pose: 'elder_cane', sw: 'Mzee wa Kijiji na Bakora', en: 'Village Elder with Walking Stick', label: 'MZEE' },
    { pose: 'teacher_book', sw: 'Mwalimu na Kitabu / Chaki', en: 'School Teacher with Book', label: 'MWALIMU' },
    { pose: 'student_bag', sw: 'Mwanafunzi Mwenye Begi la Shule', en: 'Student with School Backpack', label: 'SHULE' },
    { pose: 'doctor_coat', sw: 'Daktari / Muuguzi wa Afya', en: 'Doctor / Nurse in Lab Coat', label: 'AFYA' },
    { pose: 'journalist_mic', sw: 'Mwandishi wa Habari na Kipaza Sauti', en: 'Journalist with Microphone & Press Pass', label: 'HABARI' },
    { pose: 'worker_helmet', sw: 'Mfanyakazi wa Ujenzi / Kiwanda', en: 'Construction / Factory Worker', label: 'UJENZI' },
    { pose: 'empty_basket', sw: 'Mwananchi Mwenye Kikapu Kitupu (Bei Juu)', en: 'Citizen with Empty Basket (Cost of Living)', label: 'BEI JUU' },
    { pose: 'taxpayer_pockets', sw: 'Mlipa Kodi Akigeuza Mifuko Mitupu', en: 'Taxpayer Showing Empty Pockets', label: 'KODI' },
  ];
  const citExprs: CartoonVariantConfig['expression'][] = ['shocked', 'happy', 'angry', 'tired', 'pleading'];
  citizenTypes.forEach((ct, ci) => {
    for (let v = 0; v < 5; v++) {
      const idx = ci * 5 + v;
      push({
        id: `citizen_${ci}_${v}`,
        category: 'citizens',
        titleSw: `${ct.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${ct.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `wananchi raia mwananchi mkulima mama bodaboda kijana mzee kodi bei ${ct.sw} ${ct.en}`,
        defaultW: 20,
        defaultH: 34,
        primaryColor: ['#0284C7', '#16A34A', '#D97706', '#DC2626', '#7C3AED'][v],
        secondaryColor: ['#FACC15', '#F97316', '#0F172A', '#2563EB', '#10B981'][v],
        skinColor: skinTones[idx % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: ct.label,
        config: {
          archetype: 'character_citizen',
          pose: ct.pose,
          expression: citExprs[(ci + v) % citExprs.length],
          headwear: ci === 3 || ci === 10 ? 'helmet' : ci === 2 ? 'headscarf' : v === 2 ? 'cap' : v === 4 ? 'glasses' : 'none',
          prop: ct.pose,
          outfit: ct.pose,
          detailLevel: v + 1,
          fxMarks: v === 0 ? 'none' : v === 1 ? 'sweat' : v === 2 ? 'shock' : v === 3 ? 'anger' : 'motion',
          sceneryMode: v,
        },
      });
    }
  });

  // 5. BENDERA YA TAIFA (NATIONAL FLAGS — 35 distinct pieces)
  const flagVariants = [
    { pose: 'tall_pole', sw: 'Bendera ya Taifa Ikipepea Kwenye Mlingoti', en: 'National Flag Waving on Tall Pole', label: 'TAIFA' },
    { pose: 'hand_flag', sw: 'Bendera Ndogo ya Mkononi', en: 'Handheld Mini National Flag', label: 'UZALENDO' },
    { pose: 'crossed_flags', sw: 'Bendera Mbili Zilizovuka (Ofisi)', en: 'Crossed Ceremonial Flags', label: 'AMANI' },
    { pose: 'bunting_garland', sw: 'Kamba ya Bendera za Sherehe', en: 'Festive Flag Bunting Garland', label: 'SHEREHE' },
    { pose: 'desk_flag', sw: 'Bendera ya Mezani (Mkutano)', en: 'Official Desk / Podium Flag', label: 'OFISI' },
    { pose: 'wind_banner', sw: 'Bendera Kubwa Yenye Ujumbe', en: 'Waving Patriotic Banner Flag', label: 'TANZANIA' },
    { pose: 'torch_emblem', sw: 'Bendera & Mwenge wa Taifa', en: 'National Flag with Torch Emblem', label: 'UHURU' },
  ];
  flagVariants.forEach((fl, fi) => {
    for (let v = 0; v < 5; v++) {
      push({
        id: `flag_${fi}_${v}`,
        category: 'flags',
        titleSw: `${fl.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${fl.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `bendera taifa flag tanzania mlingoti uzalendo uhuru ${fl.sw} ${fl.en}`,
        defaultW: 22,
        defaultH: 26,
        primaryColor: ['#1EB53A', '#00A3DD', '#DC2626', '#1D4ED8', '#15803D'][v],
        secondaryColor: ['#FCD116', '#FACC15', '#FFFFFF', '#F59E0B', '#FCD116'][v],
        skinColor: skinTones[0],
        hasEditableLabel: true,
        defaultLabelText: fl.label,
        config: {
          archetype: 'flag_scene',
          pose: fl.pose,
          expression: 'confident',
          headwear: 'none',
          prop: fl.pose,
          outfit: 'flag',
          detailLevel: v + 1,
          fxMarks: v % 2 === 0 ? 'motion' : 'sparkles',
          sceneryMode: v,
        },
      });
    }
  });

  // 6. MAGARI YA KISERIKALI (GOVERNMENT VEHICLES & CONVOYS — 48 distinct pieces)
  const carVariants = [
    { pose: 'presidential_limo', sw: 'Gari la Rais (Limo / V8 Yenye Bendera)', en: 'Presidential State Car with Flags', label: 'RAIS' },
    { pose: 'stk_minister_suv', sw: 'Gari la Serikali (V8 / STK)', en: 'Ministerial Government SUV (STK)', label: 'STK 001' },
    { pose: 'police_patrol', sw: 'Gari la Polisi Lenye King’ora', en: 'Police Patrol Truck with Siren', label: 'POLISI' },
    { pose: 'escort_moto', sw: 'Pikipiki ya Msafara wa Kiserikali', en: 'State Motorcade Escort Bike', label: 'MSAFARA' },
    { pose: 'campaign_truck', sw: 'Lori la Kampeni Lenye Spika Kubwa', en: 'Campaign Sound Truck with Megaphones', label: 'KURA' },
    { pose: 'stuck_pothole_suv', sw: 'Gari la Kiserikali Limekwama Kwenye Shimo', en: 'Govt SUV Stuck in Road Pothole', label: 'DFPA' },
    { pose: 'ambulance_van', sw: 'Gari la Wagonjwa la Serikali (Ambulance)', en: 'Government Medical Ambulance', label: 'AFYA' },
    { pose: 'vip_helicopter', sw: 'Helikopta ya Kampeni / Serikali', en: 'VIP / Campaign Helicopter', label: 'ANGANI' },
  ];
  carVariants.forEach((cv, cvi) => {
    for (let v = 0; v < 6; v++) {
      push({
        id: `govtcar_${cvi}_${v}`,
        category: 'govt_cars',
        titleSw: `${cv.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${cv.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `gari magari serikali rais stk dfpa v8 polisi msafara kampeni ambulance helikopta ${cv.sw} ${cv.en}`,
        defaultW: 34,
        defaultH: 22,
        primaryColor: ['#0F172A', '#1E3A8A', '#FFFFFF', '#334155', '#15803D', '#DC2626'][v],
        secondaryColor: ['#FACC15', '#DC2626', '#00A3DD', '#F97316', '#2563EB', '#FCD116'][v],
        skinColor: skinTones[v % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: cv.label,
        config: {
          archetype: 'vehicle_scene',
          pose: cv.pose,
          expression: 'confident',
          headwear: 'cap',
          prop: cv.pose,
          outfit: 'vehicle',
          detailLevel: v + 1,
          fxMarks: cvi === 5 ? 'shock' : 'motion',
          sceneryMode: v,
        },
      });
    }
  });

  // 7. MASANDUKU YA KUPIGA KURA (BALLOT BOXES — 42 distinct pieces)
  const boxVariants = [
    { pose: 'standard_box', sw: 'Sanduku la Kura (Kawaida)', en: 'Standard Ballot Box', label: 'KURA' },
    { pose: 'transparent_box', sw: 'Sanduku la Kura la Kioo (Uwazi)', en: 'Transparent Glass Ballot Box', label: 'UWAZI' },
    { pose: 'overflowing_box', sw: 'Sanduku Lililojaa Kura Hadi Juu', en: 'Overflowing Stuffed Ballot Box', label: 'IMEJAA!' },
    { pose: 'padlocked_box', sw: 'Sanduku Lililofungwa Kufuli & Mnyororo', en: 'Chained & Padlocked Ballot Box', label: 'SIRI' },
    { pose: 'broken_leaking_box', sw: 'Sanduku Lililopasuka / Karatasi Zinavuja', en: 'Cracked Leaking Ballot Box', label: 'UTATA' },
    { pose: 'voting_booth', sw: 'Kibanda cha Kupigia Kura (Polling Booth)', en: 'Private Polling Booth & Box', label: 'KITUO' },
    { pose: 'ballot_stamp', sw: 'Karatasi ya Kura & Muhuri wa "TIKI"', en: 'Ballot Paper & Checkmark Stamp', label: 'PIGA TIKI' },
  ];
  boxVariants.forEach((bx, bi) => {
    for (let v = 0; v < 6; v++) {
      push({
        id: `box_${bi}_${v}`,
        category: 'ballot_boxes',
        titleSw: `${bx.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${bx.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `sanduku masanduku kura ballot box kituo karatasi muhuri kufuli ${bx.sw} ${bx.en}`,
        defaultW: 22,
        defaultH: 26,
        primaryColor: ['#1D4E89', '#0284C7', '#16A34A', '#DC2626', '#D97706', '#475569'][v],
        secondaryColor: ['#FACC15', '#FFFFFF', '#16A34A', '#EF4444', '#F59E0B', '#38BDF8'][v],
        skinColor: skinTones[v % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: bx.label,
        config: {
          archetype: 'ballot_box_scene',
          pose: bx.pose,
          expression: 'confident',
          headwear: 'none',
          prop: bx.pose,
          outfit: 'box',
          detailLevel: v + 1,
          fxMarks: bi === 2 || bi === 4 ? 'shock' : bi === 6 ? 'sparkles' : 'none',
          sceneryMode: v,
        },
      });
    }
  });

  // 8. WATU WAKIPIGA KURA (PEOPLE VOTING — 42 distinct pieces)
  const voterVariants = [
    { pose: 'dropping_ballot', sw: 'Mpiga Kura Akitumbukiza Karatasi Sandukuni', en: 'Voter Dropping Ballot in Box', label: 'KURA YANGU' },
    { pose: 'long_queue', sw: 'Foleni ya Watu Wakipiga Kura Kituoni', en: 'Queue of Citizens Waiting to Vote', label: 'FOLENI' },
    { pose: 'inked_finger', sw: 'Mpiga Kura Akionyesha Kidole Chenye Wino', en: 'Voter Showing Inked Finger', label: 'NIMEPIGA' },
    { pose: 'elder_voting', sw: 'Mzee Akipiga Kura Kwa Shauku', en: 'Elder Casting Ballot with Cane', label: 'HAKI' },
    { pose: 'woman_voting', sw: 'Mama Akipiga Kura Kituoni', en: 'Woman Casting Ballot at Station', label: 'UCHAGUZI' },
    { pose: 'official_checking', sw: 'Msimamizi Akikagua Daftari la Wapiga Kura', en: 'Poll Clerk Checking Voter Register', label: 'DAFTARI' },
    { pose: 'counting_votes', sw: 'Watu Wakihesabu Kura Usiku / Mchana', en: 'Tallying & Counting Cast Ballots', label: 'HESABU' },
  ];
  voterVariants.forEach((vt, vi) => {
    for (let v = 0; v < 6; v++) {
      push({
        id: `voter_${vi}_${v}`,
        category: 'voters',
        titleSw: `${vt.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${vt.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `wapiga kura kupiga kura ballot voter foleni wino uchaguzi ${vt.sw} ${vt.en}`,
        defaultW: 26,
        defaultH: 30,
        primaryColor: ['#1D4E89', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0284C7'][v],
        secondaryColor: ['#FACC15', '#16A34A', '#3B82F6', '#F97316', '#FFFFFF', '#0F172A'][v],
        skinColor: skinTones[v % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: vt.label,
        config: {
          archetype: 'voter_action_scene',
          pose: vt.pose,
          expression: v % 2 === 0 ? 'happy' : 'confident',
          headwear: v === 1 ? 'kofia' : v === 3 ? 'headscarf' : v === 4 ? 'glasses' : 'none',
          prop: vt.pose,
          outfit: 'citizen',
          detailLevel: v + 1,
          fxMarks: v % 3 === 0 ? 'sparkles' : 'motion',
          sceneryMode: v,
        },
      });
    }
  });

  // 9. WATU WAKIIMBA KURA / UMATI (PEOPLE CHANTING, SINGING & RALLYING — 48 distinct pieces)
  const chantVariants = [
    { pose: 'singing_rally', sw: 'Umati Ukiimba Nyimbo za Kura & Kampeni', en: 'Crowd Singing Election & Rally Chants', label: 'TUNAIMBA!' },
    { pose: 'placard_marchers', sw: 'Watu Wenye Mabango Wakipaza Sauti', en: 'Crowd Marching with Raised Placards', label: 'TUNATAKA HAKI' },
    { pose: 'vuvuzela_drums', sw: 'Mashabiki na Ngoma & Vuvuzela Wakishangilia', en: 'Supporters Cheering with Drums & Vuvuzelas', label: 'USHINDI!' },
    { pose: 'raised_fists', sw: 'Watu Wakiimba Na Kunyoosha Mikono Juu', en: 'People Chanting with Raised Hands', label: 'SAUTI YETU' },
    { pose: 'angry_protest', sw: 'Wananchi Wakiimba Kupinga Gharama za Maisha', en: 'Citizens Chanting Against High Prices', label: 'BEI KUBWA!' },
    { pose: 'choir_flags', sw: 'Kwaya ya Wananchi na Bendera za Sherehe', en: 'Community Choir Singing with Flags', label: 'AMANI' },
    { pose: 'youth_cheer', sw: 'Vijana Wakiimba na Kucheza Mtaani', en: 'Youth Dancing & Chanting Together', label: 'VIJANA!' },
    { pose: 'megaphone_leader', sw: 'Kiongozi wa Umati Akiongoza Nyimbo na Spika', en: 'Crowd Leader Leading Chants on Megaphone', label: 'OYEEE!' },
  ];
  chantVariants.forEach((ch, chi) => {
    for (let v = 0; v < 6; v++) {
      push({
        id: `chant_${chi}_${v}`,
        category: 'chanting_crowds',
        titleSw: `${ch.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${ch.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `wakiimba kura umati mkutano kelele mabango ngoma vuvuzela mashabiki ${ch.sw} ${ch.en}`,
        defaultW: 38,
        defaultH: 28,
        primaryColor: ['#1D4E89', '#16A34A', '#DC2626', '#D97706', '#7C3AED', '#0F172A'][v],
        secondaryColor: ['#FACC15', '#FFFFFF', '#F97316', '#38BDF8', '#10B981', '#EF4444'][v],
        skinColor: skinTones[v % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: ch.label,
        config: {
          archetype: 'crowd_chant_scene',
          pose: ch.pose,
          expression: chi === 4 ? 'angry' : 'happy',
          headwear: v % 2 === 0 ? 'cap' : 'none',
          prop: ch.pose,
          outfit: 'crowd',
          detailLevel: v + 1,
          fxMarks: chi === 4 ? 'anger' : 'motion',
          sceneryMode: v,
        },
      });
    }
  });

  // 10. KIONGOZI AKIPIGA SIASA (POLITICIAN DOING POLITICS / SATIRE — 56 distinct pieces)
  const polVariants = [
    { pose: 'pounding_podium', sw: 'Kiongozi Akipiga Siasa Kwa Hamasa Jukwaani', en: 'Politician Pounding Podium in Speech', label: 'SIASA' },
    { pose: 'boxing_rivals', sw: 'Wanasiasa Wawili Ulingoni (Mtindo wa DW)', en: 'Two Politicians in DW Boxing Ring', label: 'MPAMBANO' },
    { pose: 'giant_promises', sw: 'Mwanasiasa Akitoa Ahadi Kubwa za Hewani', en: 'Politician Blowing Giant Air Promises', label: 'AHADI HEWA' },
    { pose: 'whispering_deal', sw: 'Viongozi Wakinong’onezana Nyuma ya Pazia', en: 'Politicians Whispering Backroom Deal', label: 'SIRI' },
    { pose: 'sleeping_parliament', sw: 'Mbunge Akisinzia Kwenye Kiti cha Bunge', en: 'Politician Sleeping in Parliament Bench', label: 'BUNGENI' },
    { pose: 'dodging_press', sw: 'Kiongozi Akikimbia Maswali ya Waandishi', en: 'Leader Running Away from Reporters', label: 'NO COMMENT' },
    { pose: 'sweating_audit', sw: 'Kiongozi Akitoka Jasho Mbele ya Mkaguzi', en: 'Politician Sweating Over Audit Report', label: 'HESABU!?' },
    { pose: 'juggling_taxes', sw: 'Kiongozi Akicheza na Kodi & Bei za Wananchi', en: 'Politician Juggling Taxes & Prices', label: 'KODI' },
  ];
  const polHeads: CartoonVariantConfig['headwear'][] = ['dw_glasses', 'glasses', 'kofia', 'bald', 'cap', 'none', 'dw_glasses'];
  const polExprs: CartoonVariantConfig['expression'][] = ['confident', 'angry', 'sneaky', 'shocked', 'tired', 'pleading', 'happy'];
  polVariants.forEach((pv, pvi) => {
    for (let v = 0; v < 7; v++) {
      push({
        id: `pol_${pvi}_${v}`,
        category: 'politicians',
        titleSw: `${pv.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${pv.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `kiongozi siasa mwanasiasa mbunge jukwaa ulingo ahadi dw ${pv.sw} ${pv.en}`,
        defaultW: pv.pose === 'boxing_rivals' || pv.pose === 'whispering_deal' ? 38 : 24,
        defaultH: 34,
        primaryColor: suitColors[(pvi + v) % suitColors.length],
        secondaryColor: accentColors[(pvi + v) % accentColors.length],
        skinColor: skinTones[(pvi + v) % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: pv.label,
        config: {
          archetype: 'character_leader',
          pose: pv.pose,
          expression: polExprs[(pvi + v) % polExprs.length],
          headwear: polHeads[v],
          prop: pv.pose,
          outfit: 'suit_tie',
          detailLevel: v + 1,
          fxMarks: pvi === 6 ? 'sweat' : pvi === 1 ? 'shock' : pvi === 5 ? 'motion' : 'none',
          sceneryMode: v,
        },
      });
    }
  });

  // 11. KIONGOZI AKIOMBA KURA (POLITICIAN ASKING / BEGGING FOR VOTES — 45 distinct pieces)
  const campVariants = [
    { pose: 'kneeling_plea', sw: 'Kiongozi Amepiga Magoti Akiomba Kura', en: 'Politician Kneeling Begging for Votes', label: 'NIPOKEENI!' },
    { pose: 'bowing_hands', sw: 'Kiongozi Akiomba Kura Kwa Mikono Miwili', en: 'Candidate Pleading with Clasped Hands', label: 'NICHAGUENI' },
    { pose: 'shaking_hands', sw: 'Mgombea Akisalimiana na Wananchi Mtaani', en: 'Candidate Shaking Hands on Street', label: 'KARIBU' },
    { pose: 'giving_caps', sw: 'Kiongozi Akigawa Kofia & Fulana za Kampeni', en: 'Candidate Handing Out Campaign Caps & Tees', label: 'ZAWADI' },
    { pose: 'megaphone_campaign', sw: 'Mgombea Akiomba Kura Kwa Kipaza Sauti', en: 'Candidate Campaigning with Megaphone', label: 'PIGA KURA' },
    { pose: 'hugging_elder', sw: 'Mgombea Akimkumbatia Mzee & Mama Ntilie', en: 'Candidate Hugging Voter During Campaign', label: 'PAMOJA' },
    { pose: 'pointing_ballot', sw: 'Mgombea Akionyesha Sanduku Lake la Kura', en: 'Candidate Pointing to Sample Ballot', label: 'TIKI HAPA' },
    { pose: 'rooftop_wave', sw: 'Mgombea Juu ya Gari Akiomba Kura', en: 'Candidate Waving from Vehicle Sunroof', label: 'KURA KWANGU' },
    { pose: 'smiling_poster', sw: 'Mgombea Akishika Bango Lake la Kampeni', en: 'Candidate Holding Own Campaign Poster', label: 'CHAGUA #1' },
  ];
  campVariants.forEach((cp, cpi) => {
    for (let v = 0; v < 5; v++) {
      push({
        id: `camp_${cpi}_${v}`,
        category: 'campaigning',
        titleSw: `${cp.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${cp.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `akiomba kura mgombea kampeni uchaguzi magoti salamu kipaza sauti ${cp.sw} ${cp.en}`,
        defaultW: 25,
        defaultH: 34,
        primaryColor: ['#1D4E89', '#16A34A', '#DC2626', '#7C3AED', '#D97706'][v],
        secondaryColor: ['#FACC15', '#FFFFFF', '#0F172A', '#38BDF8', '#F97316'][v],
        skinColor: skinTones[(cpi + v) % skinTones.length],
        hasEditableLabel: true,
        defaultLabelText: cp.label,
        config: {
          archetype: 'character_leader',
          pose: cp.pose,
          expression: v % 2 === 0 ? 'pleading' : 'happy',
          headwear: v === 1 ? 'cap' : v === 3 ? 'dw_glasses' : v === 4 ? 'kofia' : 'none',
          prop: cp.pose,
          outfit: 'campaign_shirt',
          detailLevel: v + 1,
          fxMarks: v % 2 === 0 ? 'sparkles' : 'sweat',
          sceneryMode: v,
        },
      });
    }
  });

  // 12. SITIARI ZA DW, BUNGE, MAJENGO & MABANGO (54 distinct pieces)
  const buildingVariants = [
    { pose: 'parliament_house', sw: 'Jengo la Bunge (Katuni)', en: 'Parliament Building', label: 'BUNGE' },
    { pose: 'state_house', sw: 'Ikulu / Jumba la Utawala', en: 'State House / Presidential Palace', label: 'IKULU' },
    { pose: 'courthouse', sw: 'Mahakama Kuu & Mizani', en: 'Supreme Courthouse', label: 'MAHAKAMA' },
    { pose: 'hospital_clinic', sw: 'Hospitali / Zahanati ya Kijiji', en: 'Community Hospital / Clinic', label: 'HOSPITALI' },
    { pose: 'school_building', sw: 'Jengo la Shule ya Wananchi', en: 'Public School Building', label: 'SHULE' },
  ];
  buildingVariants.forEach((bd, bdi) => {
    for (let v = 0; v < 4; v++) {
      push({
        id: `bldg_${bdi}_${v}`,
        category: 'dw_satire',
        titleSw: `${bd.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${bd.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `bunge ikulu mahakama hospitali shule jengo serikali ${bd.sw} ${bd.en}`,
        defaultW: 36,
        defaultH: 28,
        primaryColor: ['#E2E8F0', '#FEF3C7', '#DBEAFE', '#DCFCE7'][v],
        secondaryColor: ['#1D4E89', '#DC2626', '#16A34A', '#D97706'][v],
        skinColor: skinTones[0],
        hasEditableLabel: true,
        defaultLabelText: bd.label,
        config: {
          archetype: 'building_satire_scene',
          pose: bd.pose,
          expression: 'confident',
          headwear: 'none',
          prop: bd.pose,
          outfit: 'building',
          detailLevel: v + 1,
          fxMarks: 'none',
          sceneryMode: v,
        },
      });
    }
  });

  const metaphorVariants = [
    { pose: 'justice_scales', sw: 'Mizani ya Haki (Iliyoegemea / Sawa)', en: 'Scales of Justice', label: 'HAKI' },
    { pose: 'budget_pie', sw: 'Keki ya Taifa / Bajeti Kuu', en: 'National Budget Pie Slice', label: 'BAJETI' },
    { pose: 'money_bag', sw: 'Gunia la Fedha / Kodi ya Wananchi', en: 'Money Bag / Public Funds', label: 'BILIONI' },
    { pose: 'leaking_boat', sw: 'Meli Yenye Matobo (Taasisi Inayovuja)', en: 'Leaking Boat Metaphor', label: 'TUNAZAMA!' },
    { pose: 'handcuffs_file', sw: 'Pingu & Faili la Ufisadi', en: 'Handcuffs & Investigation File', label: 'UCHUNGUZI' },
    { pose: 'dove_peace', sw: 'Njiwa wa Amani & Tawi la Mzeituni', en: 'Peace Dove with Olive Branch', label: 'AMANI' },
    { pose: 'democracy_tree', sw: 'Mti wa Demokrasia & Katiba', en: 'Tree of Democracy', label: 'DEMOKRASIA' },
    { pose: 'power_chair', sw: 'Kiti cha Uongozi Kinachowaka Moto', en: 'Hot Seat of Power', label: 'MADARAKA' },
  ];
  metaphorVariants.forEach((mt, mti) => {
    for (let v = 0; v < 3; v++) {
      push({
        id: `meta_${mti}_${v}`,
        category: 'dw_satire',
        titleSw: `${mt.sw}${v === 0 ? '' : ` #${v + 1}`}`,
        titleEn: `${mt.en}${v === 0 ? '' : ` #${v + 1}`}`,
        keywords: `sitiari dw mizani keki bajeti pesa meli pingu amani kiti ufisadi ${mt.sw} ${mt.en}`,
        defaultW: 24,
        defaultH: 24,
        primaryColor: ['#D97706', '#1D4E89', '#16A34A'][v],
        secondaryColor: ['#FACC15', '#DC2626', '#0EA5E9'][v],
        skinColor: skinTones[0],
        hasEditableLabel: true,
        defaultLabelText: mt.label,
        config: {
          archetype: 'metaphor_prop_scene',
          pose: mt.pose,
          expression: 'confident',
          headwear: 'none',
          prop: mt.pose,
          outfit: 'prop',
          detailLevel: v + 1,
          fxMarks: mti === 3 || mti === 7 ? 'shock' : 'sparkles',
          sceneryMode: v,
        },
      });
    }
  });

  const signVariants = [
    { pose: 'hand_placard', sw: 'Bango la Mkononi (Hariri Maneno)', en: 'Hand-Held Protest Placard (Editable)', label: 'TUNATAKA MAJI!' },
    { pose: 'road_billboard', sw: 'Bango Kubwa la Barabarani (Billboard)', en: 'Roadside Political Billboard', label: 'AHADI YETU 2026' },
    { pose: 'newspaper_front', sw: 'Gazeti la Habari Kuu (Editable)', en: 'Front-Page Newspaper Satire', label: 'HABARI KUU!' },
    { pose: 'tv_breaking', sw: 'Skrini ya TV "TAARIFA YA HABARI"', en: 'TV Breaking News Frame', label: 'LIVE: BUNGENI' },
    { pose: 'street_signpost', sw: 'Kibao cha Mtaa / Mradi (Editable)', en: 'Project / Street Signpost', label: 'MRADI WA BARABARA' },
  ];
  signVariants.forEach((sg, sgi) => {
    for (let v = 0; v < 2; v++) {
      push({
        id: `sign_${sgi}_${v}`,
        category: 'dw_satire',
        titleSw: `${sg.sw}${v === 0 ? '' : ` (${v + 1})`}`,
        titleEn: `${sg.en}${v === 0 ? '' : ` (${v + 1})`}`,
        keywords: `bango placard billboard gazeti tv habari kibao maandishi maneno ${sg.sw} ${sg.en}`,
        defaultW: 28,
        defaultH: 24,
        primaryColor: v === 0 ? '#FEF08A' : '#FFFFFF',
        secondaryColor: v === 0 ? '#DC2626' : '#1D4E89',
        skinColor: skinTones[0],
        hasEditableLabel: true,
        defaultLabelText: sg.label,
        config: {
          archetype: 'sign_media_scene',
          pose: sg.pose,
          expression: 'confident',
          headwear: 'none',
          prop: sg.pose,
          outfit: 'sign',
          detailLevel: v + 1,
          fxMarks: 'none',
          sceneryMode: v,
        },
      });
    }
  });

  return list;
}

export const CARTOON_CATALOG: CartoonAssetDef[] = buildCartoonCatalog();

export const CARTOON_CATALOG_MAP = new Map<string, CartoonAssetDef>(
  CARTOON_CATALOG.map((item) => [item.id, item])
);

// ----------------------------------------------------------------------------
// STARTER MULTI-PIECE COMBINABLE SCENE COMBOS (100% EDITABLE OBJECTS)
// ----------------------------------------------------------------------------
export const CARTOON_SCENE_COMBOS: CartoonSceneCombo[] = [
  {
    id: 'combo_president_stadium',
    titleSw: 'Rais Akihutubia Uwanjani + Umati & Bendera',
    titleEn: 'President Addressing Stadium + Crowd & Flags',
    descSw: 'Uwanja wa mpira, Rais jukwaani, bendera ya taifa na wananchi wakiimba.',
    descEn: 'Stadium rally with President at podium, national flags & chanting citizens.',
    paperTint: '#FAF6EA',
    items: [
      {
        assetId: 'stadium_1_0',
        xPct: 50,
        yPct: 38,
        widthPct: 76,
        heightPct: 50,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#16A34A',
        secondaryColor: '#FACC15',
        skinColor: '#9C623E',
        labelText: 'UWANJA WA TAIFA',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'flag_0_0',
        xPct: 16,
        yPct: 30,
        widthPct: 18,
        heightPct: 26,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#1EB53A',
        secondaryColor: '#FCD116',
        skinColor: '#9C623E',
        labelText: 'TAIFA',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'pres_0_0',
        xPct: 50,
        yPct: 56,
        widthPct: 26,
        heightPct: 40,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#0F172A',
        secondaryColor: '#FACC15',
        skinColor: '#7B4626',
        labelText: 'RAIS',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'chant_0_0',
        xPct: 24,
        yPct: 80,
        widthPct: 36,
        heightPct: 28,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#1D4E89',
        secondaryColor: '#FACC15',
        skinColor: '#9C623E',
        labelText: 'OYEEE!',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'chant_2_1',
        xPct: 77,
        yPct: 80,
        widthPct: 36,
        heightPct: 28,
        rotationDeg: 0,
        flipX: true,
        opacity: 1,
        primaryColor: '#16A34A',
        secondaryColor: '#FFFFFF',
        skinColor: '#7B4626',
        labelText: 'KAZI IENDELEE',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
    ],
    bubbles: [
      {
        kind: 'speech',
        text: 'WANANCHI! MAENDELEO YANAENDELEA!',
        xPct: 68,
        yPct: 22,
        widthPct: 32,
        fontSize: 26,
        tailSide: 'left',
      },
    ],
  },
  {
    id: 'combo_pothole_campaign',
    titleSw: 'Kiongozi Akiomba Kura Kwenye Barabara Mbovu',
    titleEn: 'Politician Begging Votes on Potholed Road',
    descSw: 'Gari la serikali limekwama shimoni wakati mgombea akipiga magoti kuomba kura.',
    descEn: 'Govt SUV stuck in pothole while candidate kneels asking citizens for votes.',
    paperTint: '#FAF6EA',
    items: [
      {
        assetId: 'road_1_0',
        xPct: 50,
        yPct: 76,
        widthPct: 92,
        heightPct: 34,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#475569',
        secondaryColor: '#FACC15',
        skinColor: '#9C623E',
        labelText: 'MASHIMO',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'govtcar_5_0',
        xPct: 74,
        yPct: 56,
        widthPct: 36,
        heightPct: 24,
        rotationDeg: -8,
        flipX: false,
        opacity: 1,
        primaryColor: '#0F172A',
        secondaryColor: '#FACC15',
        skinColor: '#9C623E',
        labelText: 'STK 001',
        textColor: '#FFFFFF',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'camp_0_0',
        xPct: 44,
        yPct: 58,
        widthPct: 25,
        heightPct: 36,
        rotationDeg: 0,
        flipX: true,
        opacity: 1,
        primaryColor: '#1D4E89',
        secondaryColor: '#FACC15',
        skinColor: '#9C623E',
        labelText: 'NICHAGUENI!',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'citizen_1_0',
        xPct: 18,
        yPct: 58,
        widthPct: 21,
        heightPct: 36,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#D97706',
        secondaryColor: '#16A34A',
        skinColor: '#7B4626',
        labelText: 'MWANANCHI',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
    ],
    bubbles: [
      {
        kind: 'speech',
        text: 'Nawaomba kura! Nitatengeneza hii barabara kesho!',
        xPct: 48,
        yPct: 20,
        widthPct: 36,
        fontSize: 25,
        tailSide: 'left',
      },
      {
        kind: 'thought',
        text: 'Miaka 5 iliyopita ulisema hivyo hivyo!?',
        xPct: 20,
        yPct: 24,
        widthPct: 28,
        fontSize: 23,
        tailSide: 'right',
      },
    ],
  },
  {
    id: 'combo_election_day',
    titleSw: 'Siku ya Kura: Wapiga Kura, Masanduku & Umati',
    titleEn: 'Election Day: Voters, Ballot Boxes & Singing Crowd',
    descSw: 'Wananchi wakipiga kura kwa utulivu huku wengine wakiimba nyimbo za ushindi.',
    descEn: 'Citizens casting ballots at boxes while supporters sing and wave national flags.',
    paperTint: '#FFFFFF',
    items: [
      {
        assetId: 'flag_0_0',
        xPct: 14,
        yPct: 30,
        widthPct: 18,
        heightPct: 26,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#1EB53A',
        secondaryColor: '#FCD116',
        skinColor: '#9C623E',
        labelText: 'UCHAGUZI',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'voter_0_0',
        xPct: 36,
        yPct: 58,
        widthPct: 28,
        heightPct: 34,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#1D4E89',
        secondaryColor: '#FACC15',
        skinColor: '#7B4626',
        labelText: 'KURA HURU',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'box_1_0',
        xPct: 56,
        yPct: 62,
        widthPct: 20,
        heightPct: 26,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#0284C7',
        secondaryColor: '#FFFFFF',
        skinColor: '#9C623E',
        labelText: 'KURA',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'chant_0_1',
        xPct: 80,
        yPct: 62,
        widthPct: 34,
        heightPct: 30,
        rotationDeg: 0,
        flipX: true,
        opacity: 1,
        primaryColor: '#16A34A',
        secondaryColor: '#FACC15',
        skinColor: '#9C623E',
        labelText: 'TUNAIMBA!',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
    ],
    bubbles: [
      {
        kind: 'banner',
        text: 'KURA YAKO NI SAUTI YAKO!',
        xPct: 52,
        yPct: 16,
        widthPct: 46,
        fontSize: 30,
        tailSide: 'left',
      },
    ],
  },
  {
    id: 'combo_dw_boxing_politics',
    titleSw: 'Mpambano wa Siasa Ulingoni (Mtindo wa DW)',
    titleEn: 'Political Boxing Ring Debate (DW Style)',
    descSw: 'Viongozi wakipiga siasa ulingoni huku wananchi na waandishi wakiangalia.',
    descEn: 'Two rival politicians in a DW-style boxing ring watched by journalists & citizens.',
    paperTint: '#FAF6EA',
    items: [
      {
        assetId: 'pol_1_0',
        xPct: 50,
        yPct: 48,
        widthPct: 52,
        heightPct: 48,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#DC2626',
        secondaryColor: '#1D4ED8',
        skinColor: '#9C623E',
        labelText: 'ULINGO',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'citizen_9_0',
        xPct: 16,
        yPct: 74,
        widthPct: 20,
        heightPct: 32,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        primaryColor: '#0284C7',
        secondaryColor: '#FACC15',
        skinColor: '#7B4626',
        labelText: 'HABARI',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
      {
        assetId: 'citizen_0_2',
        xPct: 84,
        yPct: 74,
        widthPct: 20,
        heightPct: 32,
        rotationDeg: 0,
        flipX: true,
        opacity: 1,
        primaryColor: '#475569',
        secondaryColor: '#DC2626',
        skinColor: '#9C623E',
        labelText: 'MWANANCHI',
        textColor: '#0F172A',
        strokeWidthScale: 1,
        locked: false,
      },
    ],
    bubbles: [
      {
        kind: 'thought',
        text: '!?',
        xPct: 76,
        yPct: 22,
        widthPct: 16,
        fontSize: 48,
        tailSide: 'left',
      },
    ],
  },
];

// ----------------------------------------------------------------------------
// PROCEDURAL DW-STYLE EDITORIAL CARTOON RENDERER (VECTOR ON CANVAS 2D)
// ----------------------------------------------------------------------------
export interface CartoonDrawOptions {
  primaryColor?: string;
  secondaryColor?: string;
  skinColor?: string;
  labelText?: string;
  textColor?: string;
  strokeWidthScale?: number;
  w: number;
  h: number;
}

function drawInkRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke = '#111827',
  lw = 2.5
) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

function drawInkEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  stroke = '#111827',
  lw = 2.5
) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawCartoonHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  skinColor: string,
  cfg: CartoonVariantConfig,
  lw: number,
  accentColor: string
) {
  // Ears
  drawInkEllipse(ctx, cx - r * 0.98, cy + r * 0.05, r * 0.18, r * 0.24, skinColor, '#111827', lw * 0.85);
  drawInkEllipse(ctx, cx + r * 0.98, cy + r * 0.05, r * 0.18, r * 0.24, skinColor, '#111827', lw * 0.85);

  // Caricature Head Shape (varied slightly by detailLevel)
  const jawStretch = cfg.detailLevel % 2 === 0 ? 1.08 : 1.0;
  drawInkEllipse(ctx, cx, cy, r, r * jawStretch, skinColor, '#111827', lw);

  // Hair / Headwear
  if (cfg.headwear === 'kofia') {
    drawInkRect(ctx, cx - r * 0.85, cy - r * 1.15, r * 1.7, r * 0.56, r * 0.22, accentColor, '#111827', lw);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.65, cy - r * 0.85);
    ctx.lineTo(cx + r * 0.65, cy - r * 0.85);
    ctx.stroke();
  } else if (cfg.headwear === 'cap') {
    ctx.fillStyle = accentColor;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.45, r * 0.96, Math.PI, 0);
    ctx.lineTo(cx + r * 1.45, cy - r * 0.45);
    ctx.lineTo(cx - r * 0.96, cy - r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (cfg.headwear === 'helmet') {
    ctx.fillStyle = '#FACC15';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.35, r * 1.05, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (cfg.headwear === 'headscarf') {
    ctx.fillStyle = accentColor;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.1, r * 1.12, Math.PI * 0.95, Math.PI * 2.05);
    ctx.lineTo(cx + r * 1.08, cy + r * 0.95);
    ctx.lineTo(cx - r * 1.08, cy + r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Re-paint inner face oval
    drawInkEllipse(ctx, cx, cy + r * 0.08, r * 0.82, r * 0.86, skinColor, '#111827', lw * 0.8);
  } else if (cfg.headwear === 'crown_sash') {
    // Neat dark hair with silver temples
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.35, r * 0.96, Math.PI * 1.05, -0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (cfg.headwear !== 'bald') {
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.42, r * 0.95, Math.PI * 1.05, -0.05);
    ctx.fill();
  }

  // Eyes / Big DW Glasses
  if (cfg.headwear === 'dw_glasses') {
    drawInkRect(ctx, cx - r * 0.78, cy - r * 0.34, r * 0.7, r * 0.46, r * 0.12, '#FFFFFF', '#111827', lw);
    drawInkRect(ctx, cx + r * 0.08, cy - r * 0.34, r * 0.7, r * 0.46, r * 0.12, '#FFFFFF', '#111827', lw);
    // Bridge
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.08, cy - r * 0.14);
    ctx.lineTo(cx + r * 0.08, cy - r * 0.14);
    ctx.stroke();
    // Pupils
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(cx - r * 0.36, cy - r * 0.11, r * 0.1, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.46, cy - r * 0.11, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawInkEllipse(ctx, cx - r * 0.34, cy - r * 0.12, r * 0.16, r * 0.19, '#FFFFFF', '#111827', lw * 0.8);
    drawInkEllipse(ctx, cx + r * 0.34, cy - r * 0.12, r * 0.16, r * 0.19, '#FFFFFF', '#111827', lw * 0.8);
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(cx - r * 0.31, cy - r * 0.1, r * 0.075, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.36, cy - r * 0.1, r * 0.075, 0, Math.PI * 2);
    ctx.fill();

    if (cfg.headwear === 'glasses') {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.arc(cx - r * 0.34, cy - r * 0.12, r * 0.25, 0, Math.PI * 2);
      ctx.moveTo(cx - r * 0.09, cy - r * 0.12);
      ctx.lineTo(cx + r * 0.09, cy - r * 0.12);
      ctx.arc(cx + r * 0.34, cy - r * 0.12, r * 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Exaggerated Nose
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = lw * 0.85;
  ctx.beginPath();
  ctx.arc(cx + r * 0.04, cy + r * 0.18, r * 0.16, -0.5, Math.PI * 0.85);
  ctx.stroke();

  // Eyebrows & Mouth by Expression
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = lw * 0.9;
  ctx.beginPath();
  if (cfg.expression === 'angry') {
    ctx.moveTo(cx - r * 0.56, cy - r * 0.46);
    ctx.lineTo(cx - r * 0.14, cy - r * 0.26);
    ctx.moveTo(cx + r * 0.56, cy - r * 0.46);
    ctx.lineTo(cx + r * 0.14, cy - r * 0.26);
  } else if (cfg.expression === 'pleading' || cfg.expression === 'tired') {
    ctx.moveTo(cx - r * 0.55, cy - r * 0.28);
    ctx.lineTo(cx - r * 0.15, cy - r * 0.45);
    ctx.moveTo(cx + r * 0.15, cy - r * 0.45);
    ctx.lineTo(cx + r * 0.55, cy - r * 0.28);
  } else {
    ctx.moveTo(cx - r * 0.52, cy - r * 0.42);
    ctx.lineTo(cx - r * 0.15, cy - r * 0.48);
    ctx.moveTo(cx + r * 0.15, cy - r * 0.48);
    ctx.lineTo(cx + r * 0.52, cy - r * 0.42);
  }
  ctx.stroke();

  // Mouth
  ctx.beginPath();
  if (cfg.expression === 'happy' || cfg.expression === 'confident') {
    ctx.fillStyle = cfg.expression === 'happy' ? '#FFFFFF' : '#7F1D1D';
    ctx.arc(cx, cy + r * 0.4, r * 0.36, 0.1, Math.PI - 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (cfg.expression === 'shocked') {
    ctx.fillStyle = '#450A0A';
    ctx.ellipse(cx, cy + r * 0.54, r * 0.22, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (cfg.expression === 'angry') {
    ctx.fillStyle = '#FFFFFF';
    ctx.rect(cx - r * 0.32, cy + r * 0.42, r * 0.64, r * 0.24);
    ctx.fill();
    ctx.stroke();
  } else {
    // Pleading / Wavy / Sneaky
    ctx.moveTo(cx - r * 0.3, cy + r * 0.54);
    ctx.quadraticCurveTo(cx, cy + r * 0.38, cx + r * 0.3, cy + r * 0.54);
    ctx.stroke();
  }

  // DW Motion / Sweat / Shock FX marks
  if (cfg.fxMarks === 'sweat') {
    ctx.fillStyle = '#38BDF8';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx + r * 1.15, cy - r * 0.55);
    ctx.quadraticCurveTo(cx + r * 1.38, cy - r * 0.15, cx + r * 1.15, cy - r * 0.08);
    ctx.quadraticCurveTo(cx + r * 0.94, cy - r * 0.15, cx + r * 1.15, cy - r * 0.55);
    ctx.fill();
    ctx.stroke();
  } else if (cfg.fxMarks === 'shock' || cfg.fxMarks === 'motion') {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw * 0.65;
    [-1, 1].forEach((dir) => {
      ctx.beginPath();
      ctx.arc(cx + dir * r * 1.25, cy - r * 0.1, r * 0.28, dir > 0 ? -0.6 : Math.PI - 0.6, dir > 0 ? 0.6 : Math.PI + 0.6);
      ctx.stroke();
    });
  }
}

function drawNationalFlagGraphic(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c1: string,
  c2: string,
  lw: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.clip();

  // Top-left green triangle
  ctx.fillStyle = c1 || '#1EB53A';
  ctx.fillRect(x, y, w, h);

  // Bottom-right blue triangle
  ctx.fillStyle = '#00A3DD';
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();

  // Gold diagonal border
  ctx.strokeStyle = c2 || '#FCD116';
  ctx.lineWidth = Math.max(4, h * 0.24);
  ctx.beginPath();
  ctx.moveTo(x - 4, y + h + 4);
  ctx.lineTo(x + w + 4, y - 4);
  ctx.stroke();

  // Black central diagonal stripe
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = Math.max(2.5, h * 0.15);
  ctx.beginPath();
  ctx.moveTo(x - 4, y + h + 4);
  ctx.lineTo(x + w + 4, y - 4);
  ctx.stroke();

  ctx.restore();

  // Ink outer frame
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.stroke();
}

export function drawCartoonAssetToContext(
  ctx: CanvasRenderingContext2D,
  asset: CartoonAssetDef,
  opts: CartoonDrawOptions
): void {
  const { w, h } = opts;
  const primary = opts.primaryColor || asset.primaryColor;
  const secondary = opts.secondaryColor || asset.secondaryColor;
  const skin = opts.skinColor || asset.skinColor;
  const label = (opts.labelText ?? asset.defaultLabelText ?? '').trim();
  const textColor = opts.textColor || '#0F172A';
  const lw = Math.max(1.5, Math.min(w, h) * 0.016) * (opts.strokeWidthScale || 1);
  const cfg = asset.config;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // --------------------------------------------------------------------------
  // ARCHETYPE 1: LEADERS, PRESIDENTS & POLITICIANS (INCLUDING DW BOXING RING)
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'character_leader') {
    if (cfg.pose === 'boxing_rivals') {
      drawInkRect(ctx, w * 0.06, h * 0.62, w * 0.88, h * 0.3, 6, '#FEF08A', '#111827', lw);
      [0.44, 0.54, 0.64].forEach((ry, ri) => {
        ctx.strokeStyle = ri === 0 ? '#DC2626' : ri === 1 ? '#FFFFFF' : '#1D4ED8';
        ctx.lineWidth = lw * 1.4;
        ctx.beginPath();
        ctx.moveTo(w * 0.06, h * ry);
        ctx.lineTo(w * 0.94, h * ry);
        ctx.stroke();
      });
      drawInkRect(ctx, w * 0.2, h * 0.42, w * 0.16, h * 0.22, 6, primary, '#111827', lw);
      drawCartoonHead(ctx, w * 0.28, h * 0.26, Math.min(w, h) * 0.15, skin, { ...cfg, expression: 'angry', headwear: 'none' }, lw, secondary);
      drawInkEllipse(ctx, w * 0.41, h * 0.36, w * 0.06, h * 0.07, primary, '#111827', lw);
      drawInkRect(ctx, w * 0.64, h * 0.42, w * 0.16, h * 0.22, 6, secondary, '#111827', lw);
      drawCartoonHead(ctx, w * 0.72, h * 0.26, Math.min(w, h) * 0.15, skin, { ...cfg, expression: 'shocked', headwear: 'dw_glasses' }, lw, primary);
      drawInkEllipse(ctx, w * 0.59, h * 0.38, w * 0.06, h * 0.07, secondary, '#111827', lw);
      if (label) {
        ctx.fillStyle = textColor;
        ctx.font = `900 ${Math.max(10, Math.round(h * 0.08))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, w * 0.5, h * 0.78, w * 0.76);
      }
      ctx.restore();
      return;
    }

    if (cfg.pose === 'whispering_deal') {
      drawInkRect(ctx, w * 0.18, h * 0.46, w * 0.24, h * 0.34, 8, primary, '#111827', lw);
      drawInkRect(ctx, w * 0.58, h * 0.46, w * 0.24, h * 0.34, 8, secondary, '#111827', lw);
      drawCartoonHead(ctx, w * 0.32, h * 0.28, Math.min(w, h) * 0.16, skin, { ...cfg, expression: 'sneaky', headwear: 'glasses' }, lw, secondary);
      drawCartoonHead(ctx, w * 0.68, h * 0.28, Math.min(w, h) * 0.16, skin, { ...cfg, expression: 'shocked', headwear: 'dw_glasses' }, lw, primary);
      drawInkRect(ctx, w * 0.36, h * 0.66, w * 0.28, h * 0.2, 4, '#78350F', '#111827', lw);
      if (label) {
        drawInkRect(ctx, w * 0.38, h * 0.7, w * 0.24, h * 0.12, 3, '#FEF08A', '#111827', lw * 0.7);
        ctx.fillStyle = textColor;
        ctx.font = `900 ${Math.max(8, Math.round(h * 0.06))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, w * 0.5, h * 0.76, w * 0.22);
      }
      ctx.restore();
      return;
    }

    if (cfg.pose === 'sleeping_parliament') {
      // Desk in parliament + slumped torso & snoring "Zzz"
      drawInkRect(ctx, w * 0.12, h * 0.62, w * 0.76, h * 0.28, 6, '#92400E', '#111827', lw);
      drawInkRect(ctx, w * 0.26, h * 0.4, w * 0.44, h * 0.24, 10, primary, '#111827', lw);
      drawCartoonHead(ctx, w * 0.46, h * 0.48, Math.min(w, h) * 0.16, skin, { ...cfg, expression: 'tired' }, lw, secondary);
      ctx.fillStyle = '#1D4ED8';
      ctx.font = `900 ${Math.max(11, Math.round(h * 0.1))}px system-ui, sans-serif`;
      ctx.fillText('Z', w * 0.66, h * 0.32);
      ctx.font = `900 ${Math.max(13, Math.round(h * 0.12))}px system-ui, sans-serif`;
      ctx.fillText('Z', w * 0.75, h * 0.21);
      if (label) {
        drawInkRect(ctx, w * 0.28, h * 0.7, w * 0.44, h * 0.14, 4, '#FFFFFF', '#111827', lw * 0.75);
        ctx.fillStyle = textColor;
        ctx.font = `900 ${Math.max(9, Math.round(h * 0.065))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, w * 0.5, h * 0.77, w * 0.4);
      }
      ctx.restore();
      return;
    }

    const headR = Math.min(w * 0.27, h * 0.19);
    const cx = w * 0.5;
    const isKneeling = cfg.pose === 'kneeling_plea';
    const torsoTopY = isKneeling ? h * 0.52 : h * 0.42;

    // Legs / Sunroof / Kneeling posture
    if (cfg.pose === 'rooftop_wave') {
      drawInkRect(ctx, w * 0.1, h * 0.72, w * 0.8, h * 0.2, 8, '#1E293B', '#111827', lw);
      drawInkRect(ctx, w * 0.26, h * 0.68, w * 0.48, h * 0.08, 4, '#94A3B8', '#111827', lw);
    } else if (isKneeling) {
      drawInkRect(ctx, cx - w * 0.22, h * 0.76, w * 0.42, h * 0.13, 6, '#1E293B', '#111827', lw);
    } else if (cfg.pose === 'dodging_press') {
      // Running legs!
      drawInkRect(ctx, cx - w * 0.22, h * 0.72, w * 0.12, h * 0.2, 4, '#1E293B', '#111827', lw);
      drawInkRect(ctx, cx + w * 0.1, h * 0.68, w * 0.12, h * 0.2, 4, '#1E293B', '#111827', lw);
      // Microphones chasing on left
      drawInkEllipse(ctx, w * 0.14, h * 0.48, w * 0.06, w * 0.06, '#DC2626', '#111827', lw * 0.8);
      drawInkEllipse(ctx, w * 0.18, h * 0.62, w * 0.055, w * 0.055, '#2563EB', '#111827', lw * 0.8);
    } else {
      drawInkRect(ctx, cx - w * 0.15, h * 0.72, w * 0.12, h * 0.22, 4, '#1E293B', '#111827', lw);
      drawInkRect(ctx, cx + w * 0.03, h * 0.72, w * 0.12, h * 0.22, 4, '#1E293B', '#111827', lw);
    }

    // Suit / Campaign Shirt Torso
    drawInkRect(ctx, cx - w * 0.22, torsoTopY, w * 0.44, h * 0.33, 12, primary, '#111827', lw);

    if (cfg.outfit === 'presidential_sash') {
      ctx.strokeStyle = secondary;
      ctx.lineWidth = Math.max(5, w * 0.085);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.18, torsoTopY + 3);
      ctx.lineTo(cx + w * 0.18, torsoTopY + h * 0.3);
      ctx.stroke();
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = Math.max(2.5, w * 0.035);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.09, torsoTopY);
      ctx.lineTo(cx + w * 0.09, torsoTopY);
      ctx.lineTo(cx, torsoTopY + h * 0.11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.moveTo(cx, torsoTopY + h * 0.05);
      ctx.lineTo(cx + w * 0.04, torsoTopY + h * 0.23);
      ctx.lineTo(cx, torsoTopY + h * 0.27);
      ctx.lineTo(cx - w * 0.04, torsoTopY + h * 0.23);
      ctx.closePath();
      ctx.fill();
    }

    // Expressive Arms & Pose-Specific Props
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw * 1.6;
    if (cfg.pose === 'waving_sash' || cfg.pose === 'rooftop_wave' || cfg.pose === 'bowing_hands' || isKneeling) {
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.2, torsoTopY + h * 0.08);
      ctx.lineTo(cx - w * 0.36, torsoTopY - h * 0.05);
      ctx.moveTo(cx + w * 0.2, torsoTopY + h * 0.08);
      ctx.lineTo(cx + w * 0.38, torsoTopY - h * 0.12);
      ctx.stroke();
      drawInkEllipse(ctx, cx + w * 0.38, torsoTopY - h * 0.14, w * 0.055, w * 0.055, skin, '#111827', lw * 0.8);
      drawInkEllipse(ctx, cx - w * 0.36, torsoTopY - h * 0.06, w * 0.055, w * 0.055, skin, '#111827', lw * 0.8);
    } else if (cfg.pose === 'megaphone_campaign') {
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.2, torsoTopY + h * 0.06);
      ctx.lineTo(cx + w * 0.35, torsoTopY - h * 0.06);
      ctx.stroke();
      ctx.fillStyle = secondary;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.32, torsoTopY - h * 0.08);
      ctx.lineTo(cx + w * 0.47, torsoTopY - h * 0.17);
      ctx.lineTo(cx + w * 0.47, torsoTopY + h * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (cfg.pose === 'cutting_ribbon') {
      // Red ceremonial ribbon & big golden scissors
      ctx.strokeStyle = '#DC2626';
      ctx.lineWidth = Math.max(4, h * 0.035);
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.66);
      ctx.lineTo(w * 0.94, h * 0.66);
      ctx.stroke();
      drawInkEllipse(ctx, cx + w * 0.3, h * 0.56, w * 0.05, w * 0.05, '#FACC15', '#111827', lw * 0.8);
      drawInkEllipse(ctx, cx + w * 0.3, h * 0.72, w * 0.05, w * 0.05, '#FACC15', '#111827', lw * 0.8);
    } else if (cfg.pose === 'giant_promises') {
      // Fluffy giant promise clouds above hands
      drawInkEllipse(ctx, w * 0.82, h * 0.28, w * 0.15, h * 0.12, '#FFFFFF', '#111827', lw);
      ctx.fillStyle = secondary;
      ctx.font = `900 ${Math.max(8, Math.round(h * 0.06))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label || 'AHADI', w * 0.82, h * 0.28, w * 0.24);
    } else if (cfg.pose === 'juggling_taxes') {
      [0.24, 0.5, 0.76].forEach((bx, bi) => {
        drawInkEllipse(ctx, w * bx, h * (bi === 1 ? 0.08 : 0.16), w * 0.08, h * 0.07, bi === 0 ? '#DC2626' : bi === 1 ? '#FACC15' : '#16A34A', '#111827', lw * 0.8);
      });
    } else if (cfg.pose === 'giving_caps') {
      drawInkEllipse(ctx, w * 0.82, h * 0.52, w * 0.12, h * 0.07, secondary, '#111827', lw);
      drawInkRect(ctx, w * 0.72, h * 0.56, w * 0.18, h * 0.04, 2, secondary, '#111827', lw * 0.8);
    } else if (cfg.pose === 'pointing_ballot') {
      drawInkRect(ctx, w * 0.72, h * 0.58, w * 0.22, h * 0.28, 4, secondary, '#111827', lw);
      drawInkRect(ctx, w * 0.78, h * 0.48, w * 0.1, h * 0.12, 2, '#FFFFFF', '#111827', lw * 0.7);
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.21, torsoTopY + h * 0.08);
      ctx.lineTo(cx - w * 0.34, torsoTopY + h * 0.24);
      ctx.moveTo(cx + w * 0.21, torsoTopY + h * 0.08);
      ctx.lineTo(cx + w * 0.36, torsoTopY + h * 0.02);
      ctx.stroke();
    }

    // Podium / Poster / Banner
    if (cfg.pose === 'podium_speech' || cfg.pose === 'pounding_podium' || cfg.pose === 'signing_decree') {
      drawInkRect(ctx, cx - w * 0.28, h * 0.62, w * 0.56, h * 0.32, 6, '#78350F', '#111827', lw);
      drawInkRect(ctx, cx - w * 0.32, h * 0.59, w * 0.64, h * 0.07, 4, '#92400E', '#111827', lw);
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.08, h * 0.59);
      ctx.lineTo(cx - w * 0.04, h * 0.47);
      ctx.moveTo(cx + w * 0.08, h * 0.59);
      ctx.lineTo(cx + w * 0.04, h * 0.47);
      ctx.stroke();
      if (label) {
        drawInkRect(ctx, cx - w * 0.2, h * 0.69, w * 0.4, h * 0.14, 4, '#FFFFFF', '#111827', lw * 0.7);
        ctx.fillStyle = textColor;
        ctx.font = `900 ${Math.max(9, Math.round(h * 0.065))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, h * 0.76, w * 0.36);
      }
    } else if (cfg.pose === 'smiling_poster' || cfg.pose === 'holding_constitution') {
      drawInkRect(ctx, cx - w * 0.24, h * 0.58, w * 0.48, h * 0.24, 5, '#FEF08A', '#111827', lw);
      if (label) {
        ctx.fillStyle = textColor;
        ctx.font = `900 ${Math.max(9, Math.round(h * 0.065))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, h * 0.7, w * 0.42);
      }
    } else if (label && cfg.pose !== 'giant_promises') {
      drawInkRect(ctx, cx - w * 0.28, h * 0.85, w * 0.56, h * 0.12, 4, '#FEF08A', '#111827', lw * 0.8);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(9, Math.round(h * 0.06))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, h * 0.91, w * 0.5);
    }

    drawCartoonHead(ctx, cx, isKneeling ? h * 0.33 : h * 0.25, headR, skin, cfg, lw, secondary);
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 2: FOOTBALL STADIUM & POLITICAL ARENA
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'stadium_scene') {
    if (cfg.pose === 'night_floodlights') {
      // Night sky glow beams behind stadium
      ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
      ctx.beginPath();
      ctx.moveTo(w * 0.14, h * 0.12);
      ctx.lineTo(w * 0.48, h * 0.65);
      ctx.lineTo(w * 0.22, h * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.86, h * 0.12);
      ctx.lineTo(w * 0.78, h * 0.65);
      ctx.lineTo(w * 0.52, h * 0.65);
      ctx.closePath();
      ctx.fill();
    }

    drawInkEllipse(ctx, w * 0.5, h * 0.56, w * 0.46, h * 0.36, '#CBD5E1', '#111827', lw);
    drawInkEllipse(ctx, w * 0.5, h * 0.56, w * 0.4, h * 0.3, '#94A3B8', '#111827', lw * 0.7);

    if (cfg.pose === 'packed_rally' || cfg.pose === 'campaign_stage' || cfg.sceneryMode % 2 === 1) {
      for (let i = 0; i < 24; i++) {
        const ang = (i * Math.PI * 2) / 24;
        const px = w * 0.5 + Math.cos(ang) * w * 0.41;
        const py = h * 0.56 + Math.sin(ang) * h * 0.31;
        ctx.fillStyle = i % 3 === 0 ? secondary : i % 2 === 0 ? '#DC2626' : '#0F172A';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2.5, w * 0.014), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawInkEllipse(ctx, w * 0.5, h * 0.58, w * 0.32, h * 0.22, primary, '#111827', lw);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = lw * 0.75;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.36);
    ctx.lineTo(w * 0.5, h * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.58, w * 0.07, h * 0.06, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (cfg.pose === 'goalpost_satire') {
      // Football goalpost + black/white ball
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.moveTo(w * 0.38, h * 0.58);
      ctx.lineTo(w * 0.38, h * 0.4);
      ctx.lineTo(w * 0.62, h * 0.4);
      ctx.lineTo(w * 0.62, h * 0.58);
      ctx.stroke();
      drawInkEllipse(ctx, w * 0.5, h * 0.66, w * 0.055, w * 0.055, '#FFFFFF', '#111827', lw * 0.9);
    } else if (cfg.pose === 'campaign_stage' || cfg.pose === 'vip_pavilion') {
      drawInkRect(ctx, w * 0.38, h * 0.46, w * 0.24, h * 0.16, 4, secondary, '#111827', lw);
      drawInkRect(ctx, w * 0.42, h * 0.54, w * 0.16, h * 0.1, 3, '#DC2626', '#111827', lw * 0.8);
    } else if (cfg.pose === 'broken_stadium') {
      // Jagged cracks on crumbling stands
      ctx.strokeStyle = '#DC2626';
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.moveTo(w * 0.22, h * 0.42);
      ctx.lineTo(w * 0.28, h * 0.52);
      ctx.lineTo(w * 0.24, h * 0.64);
      ctx.moveTo(w * 0.76, h * 0.48);
      ctx.lineTo(w * 0.7, h * 0.62);
      ctx.stroke();
    }

    [0.14, 0.86].forEach((tx) => {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w * tx, h * 0.32);
      ctx.lineTo(w * tx, h * 0.14);
      ctx.stroke();
      drawInkRect(ctx, w * tx - w * 0.05, h * 0.09, w * 0.1, h * 0.07, 3, '#FEF08A', '#111827', lw * 0.8);
    });

    if (label) {
      drawInkRect(ctx, w * 0.3, h * 0.06, w * 0.4, h * 0.16, 5, '#0F172A', '#111827', lw);
      ctx.fillStyle = '#FACC15';
      ctx.font = `900 ${Math.max(9, Math.round(h * 0.08))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.5, h * 0.14, w * 0.36);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 3: ROADS, POTHOLES, TRAFFIC JAMS, ZEBRA & BRIDGES
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'road_scene') {
    drawInkRect(ctx, w * 0.02, h * 0.32, w * 0.96, h * 0.6, 8, cfg.pose === 'muddy_village_road' ? '#D6B88D' : '#86EFAC', '#111827', lw);

    if (cfg.pose === 'roundabout') {
      drawInkRect(ctx, w * 0.06, h * 0.52, w * 0.88, h * 0.22, 4, primary, '#111827', lw);
      drawInkRect(ctx, w * 0.38, h * 0.32, w * 0.24, h * 0.6, 4, primary, '#111827', lw);
      drawInkEllipse(ctx, w * 0.5, h * 0.62, w * 0.24, h * 0.22, primary, '#111827', lw);
      drawInkEllipse(ctx, w * 0.5, h * 0.62, w * 0.11, h * 0.1, '#16A34A', '#111827', lw);
    } else {
      ctx.fillStyle = cfg.pose === 'muddy_village_road' ? '#92400E' : primary;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w * 0.34, h * 0.32);
      ctx.lineTo(w * 0.66, h * 0.32);
      ctx.lineTo(w * 0.96, h * 0.92);
      ctx.lineTo(w * 0.04, h * 0.92);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = secondary;
      ctx.lineWidth = lw * 1.1;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.36);
      ctx.lineTo(w * 0.5, h * 0.88);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (cfg.pose === 'pothole_road' || cfg.pose === 'muddy_village_road' || cfg.pose === 'bridge_broken') {
      drawInkEllipse(ctx, w * 0.36, h * 0.66, w * 0.11, h * 0.09, '#78350F', '#111827', lw);
      drawInkEllipse(ctx, w * 0.62, h * 0.76, w * 0.13, h * 0.1, '#451A03', '#111827', lw);
      drawInkEllipse(ctx, w * 0.52, h * 0.52, w * 0.08, h * 0.06, '#78350F', '#111827', lw * 0.8);
    } else if (cfg.pose === 'traffic_jam') {
      // Bumper-to-bumper stuck cars
      drawInkRect(ctx, w * 0.38, h * 0.4, w * 0.24, h * 0.14, 5, '#DC2626', '#111827', lw * 0.8);
      drawInkRect(ctx, w * 0.32, h * 0.56, w * 0.36, h * 0.16, 6, '#FACC15', '#111827', lw * 0.8);
      drawInkRect(ctx, w * 0.24, h * 0.74, w * 0.52, h * 0.16, 6, '#2563EB', '#111827', lw);
    } else if (cfg.pose === 'police_roadblock') {
      drawInkRect(ctx, w * 0.2, h * 0.56, w * 0.6, h * 0.1, 3, '#DC2626', '#111827', lw);
      drawInkRect(ctx, w * 0.3, h * 0.56, w * 0.12, h * 0.1, 0, '#FFFFFF', '#111827', lw * 0.7);
      drawInkRect(ctx, w * 0.56, h * 0.56, w * 0.12, h * 0.1, 0, '#FFFFFF', '#111827', lw * 0.7);
    } else if (cfg.pose === 'zebra_crossing') {
      [0.24, 0.38, 0.52, 0.66].forEach((zx) => {
        drawInkRect(ctx, w * zx, h * 0.64, w * 0.08, h * 0.2, 2, '#FFFFFF', '#111827', lw * 0.6);
      });
      // Traffic light pole on right
      drawInkRect(ctx, w * 0.82, h * 0.18, w * 0.09, h * 0.28, 4, '#0F172A', '#111827', lw);
      drawInkEllipse(ctx, w * 0.865, h * 0.24, w * 0.025, w * 0.025, '#EF4444', '#111827', lw * 0.5);
      drawInkEllipse(ctx, w * 0.865, h * 0.32, w * 0.025, w * 0.025, '#FACC15', '#111827', lw * 0.5);
      drawInkEllipse(ctx, w * 0.865, h * 0.4, w * 0.025, w * 0.025, '#22C55E', '#111827', lw * 0.5);
    }

    if (cfg.pose === 'bridge_new' || cfg.pose === 'bridge_broken') {
      drawInkRect(ctx, w * 0.08, h * 0.24, w * 0.84, h * 0.12, 4, '#CBD5E1', '#111827', lw);
    }

    if (label) {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w * 0.16, h * 0.44);
      ctx.lineTo(w * 0.16, h * 0.26);
      ctx.stroke();
      drawInkRect(ctx, w * 0.05, h * 0.08, w * 0.28, h * 0.2, 5, '#FEF08A', '#111827', lw);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(9, Math.round(h * 0.085))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.19, h * 0.18, w * 0.24);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 4: CITIZENS (FARMER, BODABODA, MAMA, TAXPAYER, DOCTOR, ETC.)
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'character_citizen') {
    const cx = w * 0.5;
    const headR = Math.min(w * 0.28, h * 0.19);

    if (cfg.pose === 'bodaboda') {
      // Motorcycle wheels & frame under helmeted rider!
      drawInkEllipse(ctx, w * 0.24, h * 0.8, w * 0.13, w * 0.13, '#111827', '#111827', lw);
      drawInkEllipse(ctx, w * 0.24, h * 0.8, w * 0.06, w * 0.06, '#CBD5E1', '#111827', lw * 0.6);
      drawInkEllipse(ctx, w * 0.76, h * 0.8, w * 0.13, w * 0.13, '#111827', '#111827', lw);
      drawInkEllipse(ctx, w * 0.76, h * 0.8, w * 0.06, w * 0.06, '#CBD5E1', '#111827', lw * 0.6);
      drawInkRect(ctx, w * 0.28, h * 0.62, w * 0.44, h * 0.16, 8, '#DC2626', '#111827', lw);
      drawInkRect(ctx, cx - w * 0.16, h * 0.42, w * 0.32, h * 0.24, 8, primary, '#111827', lw);
      drawCartoonHead(ctx, cx, h * 0.24, headR, skin, cfg, lw, secondary);
      if (label) {
        drawInkRect(ctx, cx - w * 0.26, h * 0.86, w * 0.52, h * 0.11, 4, '#FFFFFF', '#111827', lw * 0.7);
        ctx.fillStyle = textColor;
        ctx.font = `900 ${Math.max(8, Math.round(h * 0.06))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, h * 0.915, w * 0.48);
      }
      ctx.restore();
      return;
    }

    drawInkRect(ctx, cx - w * 0.14, h * 0.72, w * 0.11, h * 0.22, 4, '#334155', '#111827', lw);
    drawInkRect(ctx, cx + w * 0.03, h * 0.72, w * 0.11, h * 0.22, 4, '#334155', '#111827', lw);
    drawInkRect(
      ctx,
      cx - w * 0.2,
      h * 0.43,
      w * 0.4,
      h * 0.32,
      10,
      cfg.pose === 'doctor_coat' ? '#FFFFFF' : primary,
      '#111827',
      lw
    );

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw * 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.2, h * 0.49);
    ctx.lineTo(cx - w * 0.35, h * 0.64);
    ctx.moveTo(cx + w * 0.2, h * 0.49);
    ctx.lineTo(cx + w * 0.36, h * 0.44);
    ctx.stroke();

    if (cfg.pose === 'farmer_hoe') {
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.36, h * 0.25);
      ctx.lineTo(cx + w * 0.36, h * 0.9);
      ctx.stroke();
      drawInkRect(ctx, cx + w * 0.24, h * 0.22, w * 0.2, h * 0.08, 2, '#94A3B8', '#111827', lw * 0.8);
    } else if (cfg.pose === 'journalist_mic') {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.36, h * 0.44);
      ctx.lineTo(cx + w * 0.42, h * 0.28);
      ctx.stroke();
      drawInkEllipse(ctx, cx + w * 0.43, h * 0.24, w * 0.06, w * 0.06, '#DC2626', '#111827', lw * 0.8);
    } else if (cfg.pose === 'empty_basket' || cfg.pose === 'market_mama') {
      drawInkRect(ctx, cx - w * 0.4, h * 0.56, w * 0.28, h * 0.16, 4, '#D97706', '#111827', lw * 0.8);
    } else if (cfg.pose === 'youth_phone') {
      drawInkRect(ctx, cx + w * 0.28, h * 0.34, w * 0.14, h * 0.18, 3, '#0F172A', '#111827', lw * 0.8);
      drawInkRect(ctx, cx + w * 0.3, h * 0.36, w * 0.1, h * 0.12, 1, '#38BDF8', '#111827', lw * 0.4);
    } else if (cfg.pose === 'taxpayer_pockets') {
      // Turned-out empty white trouser pockets!
      drawInkEllipse(ctx, cx - w * 0.26, h * 0.72, w * 0.08, h * 0.05, '#FFFFFF', '#111827', lw * 0.8);
      drawInkEllipse(ctx, cx + w * 0.26, h * 0.72, w * 0.08, h * 0.05, '#FFFFFF', '#111827', lw * 0.8);
    } else if (cfg.pose === 'elder_cane') {
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.34, h * 0.52);
      ctx.lineTo(cx + w * 0.34, h * 0.92);
      ctx.stroke();
    } else if (cfg.pose === 'doctor_coat') {
      drawInkRect(ctx, cx + w * 0.04, h * 0.52, w * 0.1, h * 0.1, 2, '#DC2626', '#111827', lw * 0.6);
    } else if (cfg.pose === 'teacher_book' || cfg.pose === 'student_bag') {
      drawInkRect(ctx, cx - w * 0.42, h * 0.54, w * 0.2, h * 0.18, 3, '#FEF08A', '#111827', lw * 0.8);
    }

    drawCartoonHead(ctx, cx, h * 0.26, headR, skin, cfg, lw, secondary);

    if (label) {
      drawInkRect(ctx, cx - w * 0.26, h * 0.84, w * 0.52, h * 0.12, 4, '#FFFFFF', '#111827', lw * 0.7);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(8, Math.round(h * 0.062))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, h * 0.9, w * 0.48);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 5: NATIONAL FLAGS
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'flag_scene') {
    if (cfg.pose === 'crossed_flags') {
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.92);
      ctx.lineTo(w * 0.8, h * 0.14);
      ctx.moveTo(w * 0.8, h * 0.92);
      ctx.lineTo(w * 0.2, h * 0.14);
      ctx.stroke();
      drawNationalFlagGraphic(ctx, w * 0.08, h * 0.14, w * 0.4, h * 0.28, primary, secondary, lw);
      drawNationalFlagGraphic(ctx, w * 0.52, h * 0.14, w * 0.4, h * 0.28, primary, secondary, lw);
    } else if (cfg.pose === 'bunting_garland') {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.22);
      ctx.quadraticCurveTo(w * 0.5, h * 0.42, w * 0.94, h * 0.22);
      ctx.stroke();
      [0.16, 0.34, 0.52, 0.7, 0.84].forEach((fx, fi) => {
        ctx.fillStyle = fi % 3 === 0 ? primary : fi % 2 === 0 ? secondary : '#00A3DD';
        ctx.beginPath();
        ctx.moveTo(w * (fx - 0.07), h * 0.28);
        ctx.lineTo(w * (fx + 0.07), h * 0.28);
        ctx.lineTo(w * fx, h * 0.54);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
    } else if (cfg.pose === 'desk_flag') {
      drawInkEllipse(ctx, w * 0.5, h * 0.84, w * 0.24, h * 0.08, '#D97706', '#111827', lw);
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.82);
      ctx.lineTo(w * 0.5, h * 0.16);
      ctx.stroke();
      drawNationalFlagGraphic(ctx, w * 0.5, h * 0.18, w * 0.42, h * 0.3, primary, secondary, lw);
    } else {
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = lw * 1.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.18, h * 0.92);
      ctx.lineTo(w * 0.18, h * 0.1);
      ctx.stroke();
      drawInkEllipse(ctx, w * 0.18, h * 0.08, w * 0.04, w * 0.04, '#FACC15', '#111827', lw * 0.8);
      drawNationalFlagGraphic(ctx, w * 0.2, h * 0.12, w * 0.72, h * 0.44, primary, secondary, lw);
    }
    if (label && cfg.pose !== 'crossed_flags') {
      drawInkRect(ctx, w * 0.26, h * 0.72, w * 0.62, h * 0.18, 5, '#FFFFFF', '#111827', lw * 0.8);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(9, Math.round(h * 0.085))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.57, h * 0.81, w * 0.56);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 6: GOVERNMENT VEHICLES (V8 LIMO, POLICE, MOTO, CAMPAIGN TRUCK, HELI)
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'vehicle_scene') {
    if (cfg.pose === 'vip_helicopter') {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * 0.18);
      ctx.lineTo(w * 0.88, h * 0.18);
      ctx.moveTo(w * 0.5, h * 0.18);
      ctx.lineTo(w * 0.5, h * 0.34);
      ctx.stroke();
      drawInkRect(ctx, w * 0.1, h * 0.44, w * 0.35, h * 0.1, 4, primary, '#111827', lw);
      drawInkEllipse(ctx, w * 0.56, h * 0.52, w * 0.28, h * 0.2, primary, '#111827', lw);
      drawInkEllipse(ctx, w * 0.64, h * 0.48, w * 0.14, h * 0.1, '#BAE6FD', '#111827', lw * 0.8);
      ctx.beginPath();
      ctx.moveTo(w * 0.36, h * 0.8);
      ctx.lineTo(w * 0.78, h * 0.8);
      ctx.stroke();
    } else if (cfg.pose === 'escort_moto') {
      drawInkEllipse(ctx, w * 0.24, h * 0.74, w * 0.13, w * 0.13, '#111827', '#111827', lw);
      drawInkEllipse(ctx, w * 0.74, h * 0.74, w * 0.13, w * 0.13, '#111827', '#111827', lw);
      drawInkRect(ctx, w * 0.24, h * 0.44, w * 0.5, h * 0.22, 10, '#FFFFFF', '#111827', lw);
      drawInkRect(ctx, w * 0.58, h * 0.24, w * 0.14, h * 0.22, 4, '#BAE6FD', '#111827', lw * 0.8);
      drawInkEllipse(ctx, w * 0.3, h * 0.34, w * 0.05, w * 0.05, '#2563EB', '#111827', lw * 0.7);
    } else {
      const bodyTop = cfg.pose === 'campaign_truck' ? h * 0.26 : h * 0.38;
      drawInkRect(ctx, w * 0.08, bodyTop, w * 0.84, h * 0.38, 12, primary, '#111827', lw);
      drawInkRect(ctx, w * 0.2, h * 0.2, w * 0.56, h * 0.24, 10, primary, '#111827', lw);
      drawInkRect(ctx, w * 0.25, h * 0.24, w * 0.22, h * 0.14, 4, '#BAE6FD', '#111827', lw * 0.7);
      drawInkRect(ctx, w * 0.5, h * 0.24, w * 0.21, h * 0.14, 4, '#BAE6FD', '#111827', lw * 0.7);

      if (cfg.pose === 'presidential_limo' || cfg.pose === 'stk_minister_suv') {
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(w * 0.85, bodyTop);
        ctx.lineTo(w * 0.85, bodyTop - h * 0.22);
        ctx.stroke();
        drawNationalFlagGraphic(ctx, w * 0.85, bodyTop - h * 0.22, w * 0.12, h * 0.12, '#1EB53A', '#FCD116', lw * 0.6);
      }
      if (cfg.pose === 'police_patrol' || cfg.pose === 'ambulance_van') {
        drawInkRect(ctx, w * 0.42, h * 0.12, w * 0.16, h * 0.08, 3, '#DC2626', '#111827', lw * 0.7);
      } else if (cfg.pose === 'campaign_truck') {
        drawInkRect(ctx, w * 0.4, h * 0.08, w * 0.24, h * 0.12, 3, secondary, '#111827', lw * 0.8);
      } else if (cfg.pose === 'stuck_pothole_suv') {
        drawInkEllipse(ctx, w * 0.72, h * 0.84, w * 0.22, h * 0.08, '#78350F', '#111827', lw);
      }

      drawInkEllipse(ctx, w * 0.26, h * 0.78, w * 0.1, w * 0.1, '#111827', '#111827', lw);
      drawInkEllipse(ctx, w * 0.26, h * 0.78, w * 0.045, w * 0.045, '#CBD5E1', '#111827', lw * 0.6);
      drawInkEllipse(ctx, w * 0.74, h * 0.78, w * 0.1, w * 0.1, '#111827', '#111827', lw);
      drawInkEllipse(ctx, w * 0.74, h * 0.78, w * 0.045, w * 0.045, '#CBD5E1', '#111827', lw * 0.6);
    }

    if (label) {
      drawInkRect(ctx, w * 0.34, h * 0.5, w * 0.32, h * 0.16, 4, secondary, '#111827', lw * 0.7);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(9, Math.round(h * 0.085))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.5, h * 0.58, w * 0.28);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 7: BALLOT BOXES
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'ballot_box_scene') {
    if (cfg.pose === 'voting_booth') {
      drawInkRect(ctx, w * 0.14, h * 0.14, w * 0.72, h * 0.78, 8, primary, '#111827', lw);
      drawInkRect(ctx, w * 0.24, h * 0.26, w * 0.52, h * 0.64, 4, secondary, '#111827', lw);
      drawInkRect(ctx, w * 0.32, h * 0.5, w * 0.36, h * 0.32, 4, '#FFFFFF', '#111827', lw * 0.8);
    } else if (cfg.pose === 'ballot_stamp') {
      drawInkRect(ctx, w * 0.16, h * 0.18, w * 0.68, h * 0.72, 6, '#FFFFFF', '#111827', lw);
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = lw * 1.8;
      ctx.beginPath();
      ctx.moveTo(w * 0.34, h * 0.42);
      ctx.lineTo(w * 0.46, h * 0.54);
      ctx.lineTo(w * 0.68, h * 0.3);
      ctx.stroke();
      drawInkRect(ctx, w * 0.62, h * 0.08, w * 0.22, h * 0.18, 5, '#78350F', '#111827', lw);
    } else {
      const isTransparent = cfg.pose === 'transparent_box' || cfg.pose === 'overflowing_box';
      drawInkRect(ctx, w * 0.18, h * 0.28, w * 0.64, h * 0.62, 8, isTransparent ? '#E0F2FE' : primary, '#111827', lw);
      drawInkRect(ctx, w * 0.14, h * 0.22, w * 0.72, h * 0.11, 5, secondary, '#111827', lw);
      drawInkRect(ctx, w * 0.34, h * 0.25, w * 0.32, h * 0.04, 2, '#111827', '#111827', 1);

      if (cfg.pose === 'overflowing_box') {
        drawInkRect(ctx, w * 0.24, h * 0.06, w * 0.22, h * 0.18, 3, '#FFFFFF', '#111827', lw * 0.8);
        drawInkRect(ctx, w * 0.54, h * 0.08, w * 0.22, h * 0.16, 3, '#FEF08A', '#111827', lw * 0.8);
      }
      drawInkRect(ctx, w * 0.4, h * 0.06, w * 0.2, h * 0.2, 3, '#FFFFFF', '#111827', lw * 0.8);
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w * 0.45, h * 0.14);
      ctx.lineTo(w * 0.49, h * 0.19);
      ctx.lineTo(w * 0.56, h * 0.1);
      ctx.stroke();

      if (cfg.pose === 'padlocked_box') {
        drawInkRect(ctx, w * 0.43, h * 0.36, w * 0.14, h * 0.14, 3, '#FACC15', '#111827', lw * 0.8);
      } else if (cfg.pose === 'broken_leaking_box') {
        ctx.strokeStyle = '#DC2626';
        ctx.lineWidth = lw * 1.2;
        ctx.beginPath();
        ctx.moveTo(w * 0.24, h * 0.34);
        ctx.lineTo(w * 0.36, h * 0.5);
        ctx.lineTo(w * 0.22, h * 0.72);
        ctx.stroke();
      }
    }

    if (label) {
      drawInkRect(ctx, w * 0.25, h * 0.54, w * 0.5, h * 0.2, 5, '#FFFFFF', '#111827', lw * 0.8);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(10, Math.round(h * 0.085))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.5, h * 0.64, w * 0.44);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 8: PEOPLE VOTING
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'voter_action_scene') {
    if (cfg.pose === 'long_queue') {
      [0.18, 0.42, 0.66].forEach((px, pi) => {
        drawInkRect(ctx, w * (px - 0.08), h * 0.46, w * 0.16, h * 0.34, 6, pi % 2 === 0 ? primary : secondary, '#111827', lw);
        drawCartoonHead(ctx, w * px, h * 0.3, Math.min(w, h) * 0.12, skin, cfg, lw * 0.85, secondary);
      });
      drawInkRect(ctx, w * 0.78, h * 0.5, w * 0.18, h * 0.38, 4, secondary, '#111827', lw);
    } else if (cfg.pose === 'inked_finger') {
      // Big raised cartoon hand showing purple inked index finger!
      drawInkRect(ctx, w * 0.34, h * 0.42, w * 0.32, h * 0.38, 12, skin, '#111827', lw);
      drawInkRect(ctx, w * 0.44, h * 0.1, w * 0.12, h * 0.36, 8, skin, '#111827', lw);
      drawInkRect(ctx, w * 0.44, h * 0.1, w * 0.12, h * 0.13, 6, '#4338CA', '#111827', lw * 0.8);
    } else {
      drawInkRect(ctx, w * 0.16, h * 0.44, w * 0.26, h * 0.34, 8, primary, '#111827', lw);
      drawInkRect(ctx, w * 0.2, h * 0.76, w * 0.08, h * 0.16, 3, '#1E293B', '#111827', lw);
      drawInkRect(ctx, w * 0.31, h * 0.76, w * 0.08, h * 0.16, 3, '#1E293B', '#111827', lw);
      drawCartoonHead(ctx, w * 0.29, h * 0.26, Math.min(w, h) * 0.16, skin, cfg, lw, secondary);

      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.moveTo(w * 0.4, h * 0.48);
      ctx.lineTo(w * 0.65, h * 0.44);
      ctx.stroke();
      drawInkRect(ctx, w * 0.63, h * 0.36, w * 0.14, h * 0.16, 2, '#FFFFFF', '#111827', lw * 0.8);
      drawInkRect(ctx, w * 0.55, h * 0.52, w * 0.36, h * 0.4, 6, secondary, '#111827', lw);
    }
    if (label) {
      drawInkRect(ctx, w * 0.56, h * 0.64, w * 0.34, h * 0.16, 3, '#FFFFFF', '#111827', lw * 0.7);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(8, Math.round(h * 0.06))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.73, h * 0.72, w * 0.3);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 9: CHANTING & SINGING CROWDS
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'crowd_chant_scene') {
    const xs = [0.22, 0.5, 0.78];
    xs.forEach((px, idx) => {
      const yShift = idx === 1 ? -0.05 : 0;
      const bodyColor = idx === 1 ? secondary : primary;
      drawInkRect(ctx, w * (px - 0.12), h * (0.5 + yShift), w * 0.24, h * 0.38, 8, bodyColor, '#111827', lw);
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.moveTo(w * (px - 0.1), h * (0.54 + yShift));
      ctx.lineTo(w * (px - 0.18), h * (0.32 + yShift));
      ctx.moveTo(w * (px + 0.1), h * (0.54 + yShift));
      ctx.lineTo(w * (px + 0.18), h * (0.3 + yShift));
      ctx.stroke();

      drawCartoonHead(
        ctx,
        w * px,
        h * (0.34 + yShift),
        Math.min(w, h) * 0.13,
        skin,
        { ...cfg, expression: idx === 1 ? 'happy' : cfg.expression, headwear: idx === 0 ? 'cap' : 'none' },
        lw * 0.9,
        secondary
      );
    });

    if (cfg.pose === 'vuvuzela_drums') {
      // Drum on bottom center + vuvuzela horn on right
      drawInkRect(ctx, w * 0.42, h * 0.68, w * 0.16, h * 0.2, 4, '#D97706', '#111827', lw);
      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w * 0.86, h * 0.26);
      ctx.lineTo(w * 0.96, h * 0.14);
      ctx.lineTo(w * 0.96, h * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (label) {
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.32);
      ctx.lineTo(w * 0.5, h * 0.2);
      ctx.stroke();
      drawInkRect(ctx, w * 0.24, h * 0.05, w * 0.52, h * 0.17, 5, '#FEF08A', '#111827', lw);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(9, Math.round(h * 0.08))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.5, h * 0.135, w * 0.46);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 10: BUILDINGS (PARLIAMENT, STATE HOUSE, COURT, SCHOOL, CLINIC)
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'building_satire_scene') {
    if (cfg.pose === 'parliament_house' || cfg.pose === 'state_house') {
      ctx.fillStyle = secondary;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.32, w * 0.2, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = secondary;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.36);
      ctx.lineTo(w * 0.5, h * 0.12);
      ctx.lineTo(w * 0.92, h * 0.36);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    drawInkRect(ctx, w * 0.12, h * 0.36, w * 0.76, h * 0.54, 4, primary, '#111827', lw);
    [0.2, 0.34, 0.66, 0.8].forEach((px) => {
      drawInkRect(ctx, w * (px - 0.03), h * 0.38, w * 0.06, h * 0.48, 2, '#FFFFFF', '#111827', lw * 0.7);
    });
    if (cfg.pose === 'hospital_clinic') {
      drawInkRect(ctx, w * 0.47, h * 0.18, w * 0.06, h * 0.14, 1, '#DC2626', '#111827', lw * 0.5);
      drawInkRect(ctx, w * 0.43, h * 0.22, w * 0.14, h * 0.06, 1, '#DC2626', '#111827', lw * 0.5);
    }
    if (label) {
      drawInkRect(ctx, w * 0.28, h * 0.62, w * 0.44, h * 0.2, 4, '#FFFFFF', '#111827', lw * 0.8);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(9, Math.round(h * 0.085))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.5, h * 0.72, w * 0.4);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 11: DW SATIRE METAPHORS (SCALES, PIE, MONEY BAG, BOAT, DOVE, CHAIR)
  // --------------------------------------------------------------------------
  if (cfg.archetype === 'metaphor_prop_scene') {
    if (cfg.pose === 'justice_scales') {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw * 1.4;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.88);
      ctx.lineTo(w * 0.5, h * 0.2);
      ctx.moveTo(w * 0.18, h * 0.26);
      ctx.lineTo(w * 0.82, h * 0.34);
      ctx.stroke();
      drawInkEllipse(ctx, w * 0.2, h * 0.56, w * 0.14, h * 0.06, primary, '#111827', lw);
      drawInkEllipse(ctx, w * 0.8, h * 0.64, w * 0.14, h * 0.06, secondary, '#111827', lw);
    } else if (cfg.pose === 'budget_pie') {
      drawInkEllipse(ctx, w * 0.5, h * 0.54, w * 0.36, h * 0.32, primary, '#111827', lw);
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.54);
      ctx.arc(w * 0.5, h * 0.54, w * 0.34, -0.5, 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (cfg.pose === 'leaking_boat') {
      ctx.fillStyle = primary;
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.48);
      ctx.lineTo(w * 0.9, h * 0.48);
      ctx.lineTo(w * 0.74, h * 0.78);
      ctx.lineTo(w * 0.26, h * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawNationalFlagGraphic(ctx, w * 0.46, h * 0.14, w * 0.28, h * 0.2, '#1EB53A', '#FCD116', lw * 0.7);
    } else if (cfg.pose === 'handcuffs_file') {
      drawInkRect(ctx, w * 0.16, h * 0.22, w * 0.44, h * 0.56, 5, '#FEF08A', '#111827', lw);
      drawInkEllipse(ctx, w * 0.62, h * 0.52, w * 0.14, h * 0.14, '#CBD5E1', '#111827', lw);
      drawInkEllipse(ctx, w * 0.8, h * 0.46, w * 0.14, h * 0.14, '#CBD5E1', '#111827', lw);
    } else if (cfg.pose === 'dove_peace') {
      drawInkEllipse(ctx, w * 0.5, h * 0.48, w * 0.26, h * 0.16, '#FFFFFF', '#111827', lw);
      drawInkEllipse(ctx, w * 0.44, h * 0.26, w * 0.14, h * 0.12, '#F8FAFC', '#111827', lw);
      drawInkEllipse(ctx, w * 0.72, h * 0.36, w * 0.1, h * 0.09, '#FFFFFF', '#111827', lw);
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.moveTo(w * 0.8, h * 0.38);
      ctx.lineTo(w * 0.94, h * 0.34);
      ctx.stroke();
    } else if (cfg.pose === 'democracy_tree') {
      drawInkRect(ctx, w * 0.42, h * 0.48, w * 0.16, h * 0.38, 4, '#78350F', '#111827', lw);
      drawInkEllipse(ctx, w * 0.5, h * 0.34, w * 0.34, h * 0.24, '#16A34A', '#111827', lw);
    } else if (cfg.pose === 'power_chair') {
      // High-back executive seat with comic flames
      ctx.fillStyle = '#F97316';
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.76);
      ctx.lineTo(w * 0.28, h * 0.42);
      ctx.lineTo(w * 0.42, h * 0.6);
      ctx.lineTo(w * 0.5, h * 0.32);
      ctx.lineTo(w * 0.62, h * 0.6);
      ctx.lineTo(w * 0.74, h * 0.42);
      ctx.lineTo(w * 0.82, h * 0.76);
      ctx.closePath();
      ctx.fill();
      drawInkRect(ctx, w * 0.32, h * 0.2, w * 0.36, h * 0.44, 8, primary, '#111827', lw);
      drawInkRect(ctx, w * 0.28, h * 0.58, w * 0.44, h * 0.14, 6, secondary, '#111827', lw);
    } else {
      // Money bag
      drawInkEllipse(ctx, w * 0.5, h * 0.58, w * 0.32, h * 0.3, primary, '#111827', lw);
      drawInkRect(ctx, w * 0.36, h * 0.18, w * 0.28, h * 0.16, 6, secondary, '#111827', lw);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 ${Math.max(12, Math.round(h * 0.14))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', w * 0.5, h * 0.52);
    }
    if (label) {
      drawInkRect(ctx, w * 0.22, h * 0.76, w * 0.56, h * 0.18, 4, '#FFFFFF', '#111827', lw * 0.8);
      ctx.fillStyle = textColor;
      ctx.font = `900 ${Math.max(9, Math.round(h * 0.085))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * 0.5, h * 0.85, w * 0.5);
    }
    ctx.restore();
    return;
  }

  // --------------------------------------------------------------------------
  // ARCHETYPE 12: EDITABLE PLACARDS, BILLBOARDS, NEWSPAPERS & TV NEWS
  // --------------------------------------------------------------------------
  if (cfg.pose === 'hand_placard' || cfg.pose === 'street_signpost') {
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = lw * 1.6;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.58);
    ctx.lineTo(w * 0.5, h * 0.94);
    ctx.stroke();
    drawInkRect(ctx, w * 0.08, h * 0.12, w * 0.84, h * 0.52, 8, primary, '#111827', lw);
  } else if (cfg.pose === 'tv_breaking') {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.18);
    ctx.lineTo(w * 0.34, h * 0.05);
    ctx.moveTo(w * 0.5, h * 0.18);
    ctx.lineTo(w * 0.66, h * 0.05);
    ctx.stroke();
    drawInkRect(ctx, w * 0.08, h * 0.18, w * 0.84, h * 0.7, 10, '#0F172A', '#111827', lw);
    drawInkRect(ctx, w * 0.14, h * 0.24, w * 0.72, h * 0.52, 6, primary, '#111827', lw * 0.8);
    drawInkRect(ctx, w * 0.18, h * 0.28, w * 0.24, h * 0.12, 3, '#DC2626', '#111827', lw * 0.6);
  } else {
    drawInkRect(ctx, w * 0.06, h * 0.1, w * 0.88, h * 0.78, 8, primary, '#111827', lw);
    drawInkRect(ctx, w * 0.1, h * 0.14, w * 0.8, h * 0.18, 4, secondary, '#111827', lw * 0.8);
    if (cfg.pose === 'newspaper_front') {
      drawInkRect(ctx, w * 0.12, h * 0.66, w * 0.34, h * 0.14, 3, '#CBD5E1', '#111827', lw * 0.6);
      drawInkRect(ctx, w * 0.52, h * 0.68, w * 0.34, h * 0.04, 1, '#94A3B8', '#111827', lw * 0.4);
      drawInkRect(ctx, w * 0.52, h * 0.76, w * 0.34, h * 0.04, 1, '#94A3B8', '#111827', lw * 0.4);
    }
  }
  if (label) {
    ctx.fillStyle = textColor;
    ctx.font = `900 ${Math.max(10, Math.round(h * 0.11))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w * 0.5, h * (cfg.pose === 'hand_placard' || cfg.pose === 'street_signpost' ? 0.38 : 0.52), w * 0.72);
  }

  ctx.restore();
}

// Fast Thumbnail LRU Cache so scrolling 570+ items is instant 60fps
const THUMB_CACHE = new Map<string, string>();

export function getCartoonThumbnailDataUrl(asset: CartoonAssetDef): string {
  const existing = THUMB_CACHE.get(asset.id);
  if (existing) return existing;
  if (typeof document === 'undefined') return '';

  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, c.width, c.height);
  drawCartoonAssetToContext(ctx, asset, {
    w: c.width,
    h: c.height,
    primaryColor: asset.primaryColor,
    secondaryColor: asset.secondaryColor,
    skinColor: asset.skinColor,
    labelText: asset.defaultLabelText,
    strokeWidthScale: 1,
  });

  const url = c.toDataURL('image/png');
  THUMB_CACHE.set(asset.id, url);
  return url;
}
