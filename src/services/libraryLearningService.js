/**
 * Library Learning Service
 * 
 * Self-learning system that:
 * 1. Tracks errors users encounter (user-specific + system-wide)
 * 2. Verifies solutions from PRODUCT-SPECIFIC forums (Adobe, Microsoft, etc.)
 * 3. Auto-adds verified, high-quality solutions to the shared library
 * 4. Links back to original forum sources for credibility
 * 
 * @purpose Continuously improve error library from real user errors
 */

const ErrorLibrary = require('../models/ErrorLibrary');
const axios = require('axios');
const { Op } = require('sequelize');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Minimum occurrences before considering for library
  MIN_ERROR_OCCURRENCES: 3,
  
  // Minimum AI confidence to consider
  MIN_CONFIDENCE_THRESHOLD: 0.75,
  
  // Minimum helpful votes to auto-approve
  MIN_HELPFUL_VOTES: 5,
  
  // Auto-approve threshold
  AUTO_APPROVE_SCORE: 0.85,
  
  // Queue check interval (every 6 hours)
  QUEUE_CHECK_INTERVAL_MS: 6 * 60 * 60 * 1000,
  
  // Rate limiting for forum API calls
  FORUM_RATE_LIMIT: {
    requestsPerMinute: 30,
    requestsPerHour: 200,
    cooldownMs: 2000 // 2 seconds between requests
  }
};

// ============================================================================
// FORUM SOURCES FOR ALL CATEGORIES
// Comprehensive list for everyday non-tech users: banking, vehicles, electronics, appliances, etc.
// ============================================================================

const FORUM_SOURCES = {
  // ============================================================================
  // BANKING & FINANCE
  // ============================================================================
  banking: {
    forums: [
      'reddit.com/r/Banking',
      'reddit.com/r/personalfinance',
      'reddit.com/r/CreditCards',
      'bankrate.com/forums',
      'myfico.com/forums',
      'creditkarma.com/advice'
    ],
    products: ['bank', 'credit card', 'debit card', 'atm', 'online banking', 'mobile banking', 'wire transfer', 'direct deposit', 'overdraft', 'loan', 'mortgage', 'checking', 'savings', 'account'],
    rateLimit: { perMinute: 20, perHour: 150 }
  },
  
  paypal: {
    forums: ['community.paypal.com', 'reddit.com/r/paypal'],
    products: ['paypal', 'venmo', 'paypal checkout', 'paypal business'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },
  
  cryptocurrency: {
    forums: ['reddit.com/r/Bitcoin', 'reddit.com/r/CryptoCurrency', 'bitcointalk.org'],
    products: ['bitcoin', 'crypto', 'wallet', 'blockchain', 'coinbase', 'binance', 'metamask'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // VEHICLES & AUTOMOTIVE
  // ============================================================================
  automotive: {
    forums: [
      'reddit.com/r/MechanicAdvice',
      'reddit.com/r/Cartalk',
      'bobistheoilguy.com/forums',
      'automotiveforums.com',
      'carcomplaints.com'
    ],
    products: ['car', 'vehicle', 'engine', 'brake', 'transmission', 'oil', 'tire', 'battery', 'alternator', 'starter', 'check engine', 'dashboard', 'warning light', 'fuel', 'radiator', 'coolant'],
    rateLimit: { perMinute: 25, perHour: 180 }
  },
  
  toyota: {
    forums: ['toyotanation.com/forums', 'reddit.com/r/Toyota', 'priuschat.com'],
    products: ['toyota', 'camry', 'corolla', 'rav4', 'highlander', 'prius', 'tacoma', 'tundra'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  honda: {
    forums: ['honda-tech.com', 'reddit.com/r/Honda', 'civicforums.com'],
    products: ['honda', 'civic', 'accord', 'cr-v', 'pilot', 'odyssey', 'fit'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  ford: {
    forums: ['fordf150.net', 'reddit.com/r/Ford', 'blueovalforums.com', 'f150forum.com'],
    products: ['ford', 'f-150', 'f150', 'mustang', 'explorer', 'escape', 'bronco', 'ranger'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  chevrolet: {
    forums: ['reddit.com/r/Chevrolet', 'chevroletforum.com', 'corvetteforum.com'],
    products: ['chevrolet', 'chevy', 'silverado', 'equinox', 'malibu', 'camaro', 'corvette', 'tahoe'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  bmw: {
    forums: ['bimmerfest.com', 'e90post.com', 'reddit.com/r/BMW'],
    products: ['bmw', 'bimmer', '3 series', '5 series', 'x3', 'x5', 'm3', 'm5'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  mercedes: {
    forums: ['benzworld.org', 'mbworld.org', 'reddit.com/r/mercedes_benz'],
    products: ['mercedes', 'benz', 'c-class', 'e-class', 's-class', 'gle', 'glc', 'amg'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  tesla: {
    forums: ['teslamotorsclub.com', 'reddit.com/r/TeslaMotors', 'reddit.com/r/teslamodel3'],
    products: ['tesla', 'model 3', 'model y', 'model s', 'model x', 'supercharger', 'autopilot', 'fsd'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  motorcycle: {
    forums: ['reddit.com/r/motorcycles', 'advrider.com', 'sportbikes.net'],
    products: ['motorcycle', 'harley', 'honda bike', 'yamaha', 'kawasaki', 'ducati', 'suzuki', 'motorbike'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // ELECTRONICS & GADGETS
  // ============================================================================
  electronics: {
    forums: [
      'reddit.com/r/techsupport',
      'reddit.com/r/electronics',
      'ifixit.com/Answers',
      'tomshardware.com/forums'
    ],
    products: ['electronic', 'gadget', 'device', 'charger', 'cable', 'adapter', 'power supply', 'battery', 'screen', 'display', 'speaker', 'microphone'],
    rateLimit: { perMinute: 30, perHour: 200 }
  },
  
  smartphone: {
    forums: ['reddit.com/r/smartphones', 'xda-developers.com', 'androidcentral.com/forums'],
    products: ['phone', 'smartphone', 'android', 'iphone', 'samsung galaxy', 'pixel', 'oneplus', 'xiaomi', 'mobile'],
    rateLimit: { perMinute: 25, perHour: 180 }
  },
  
  samsung: {
    forums: ['us.community.samsung.com', 'reddit.com/r/samsung', 'reddit.com/r/GalaxyS'],
    products: ['samsung', 'galaxy', 'galaxy s', 'galaxy note', 'samsung tv', 'samsung washer', 'samsung fridge'],
    rateLimit: { perMinute: 25, perHour: 150 }
  },
  
  apple: {
    forums: ['discussions.apple.com', 'reddit.com/r/apple', 'reddit.com/r/iphone', 'macrumors.com/forums'],
    products: ['apple', 'iphone', 'ipad', 'mac', 'macbook', 'imac', 'airpods', 'apple watch', 'ios', 'macos', 'itunes', 'app store'],
    rateLimit: { perMinute: 25, perHour: 150 }
  },
  
  laptop: {
    forums: ['reddit.com/r/laptops', 'notebookreview.com/forums', 'laptopmag.com'],
    products: ['laptop', 'notebook', 'chromebook', 'dell laptop', 'hp laptop', 'lenovo', 'asus', 'acer'],
    rateLimit: { perMinute: 25, perHour: 150 }
  },
  
  tv: {
    forums: ['reddit.com/r/hometheater', 'reddit.com/r/4ktv', 'avsforum.com'],
    products: ['tv', 'television', 'smart tv', 'roku', 'fire stick', 'chromecast', 'lg tv', 'sony tv', 'vizio', 'tcl', 'hdmi', 'remote'],
    rateLimit: { perMinute: 25, perHour: 150 }
  },
  
  audio: {
    forums: ['reddit.com/r/headphones', 'reddit.com/r/audiophile', 'head-fi.org'],
    products: ['headphones', 'earbuds', 'speaker', 'soundbar', 'bluetooth speaker', 'subwoofer', 'amplifier', 'receiver', 'bose', 'sonos', 'jbl'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  camera: {
    forums: ['dpreview.com/forums', 'reddit.com/r/photography', 'reddit.com/r/Cameras'],
    products: ['camera', 'dslr', 'mirrorless', 'canon', 'nikon', 'sony camera', 'gopro', 'lens', 'tripod', 'webcam'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  printer: {
    forums: ['reddit.com/r/printers', 'fixyourownprinter.com'],
    products: ['printer', 'scanner', 'hp printer', 'epson', 'canon printer', 'brother printer', 'ink', 'toner', 'paper jam', 'print queue'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // HOME APPLIANCES
  // ============================================================================
  appliances: {
    forums: [
      'reddit.com/r/appliancerepair',
      'applianceblog.com/mainforums',
      'repairclinic.com/RepairHelp'
    ],
    products: ['appliance', 'refrigerator', 'fridge', 'washer', 'dryer', 'dishwasher', 'oven', 'stove', 'microwave', 'freezer', 'garbage disposal'],
    rateLimit: { perMinute: 25, perHour: 180 }
  },
  
  hvac: {
    forums: ['reddit.com/r/HVAC', 'hvac-talk.com', 'doityourself.com/forum/air-conditioning-cooling-systems'],
    products: ['ac', 'air conditioner', 'heating', 'furnace', 'thermostat', 'hvac', 'heat pump', 'central air', 'nest', 'ecobee', 'ventilation'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  whirlpool: {
    forums: ['reddit.com/r/appliancerepair', 'applianceblog.com'],
    products: ['whirlpool', 'maytag', 'kitchenaid appliance', 'kenmore'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },
  
  lg_appliances: {
    forums: ['reddit.com/r/appliancerepair', 'lg.com/us/support'],
    products: ['lg washer', 'lg dryer', 'lg refrigerator', 'lg dishwasher', 'lg oven'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },
  
  ge_appliances: {
    forums: ['reddit.com/r/appliancerepair', 'geappliances.com/support'],
    products: ['ge washer', 'ge dryer', 'ge refrigerator', 'ge dishwasher', 'ge oven', 'ge microwave'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },

  // ============================================================================
  // SMART HOME & IOT
  // ============================================================================
  smarthome: {
    forums: ['reddit.com/r/smarthome', 'reddit.com/r/homeautomation', 'community.smartthings.com'],
    products: ['smart home', 'alexa', 'google home', 'smart plug', 'smart light', 'smart lock', 'ring doorbell', 'nest cam', 'hue', 'zigbee', 'z-wave'],
    rateLimit: { perMinute: 20, perHour: 150 }
  },
  
  amazon_devices: {
    forums: ['reddit.com/r/amazonecho', 'reddit.com/r/FireTV', 'amazonforum.com'],
    products: ['echo', 'alexa', 'fire tv', 'fire stick', 'kindle', 'ring', 'blink camera', 'amazon prime'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  google_home: {
    forums: ['reddit.com/r/googlehome', 'support.google.com/googlenest/community'],
    products: ['google home', 'nest hub', 'nest thermostat', 'google assistant', 'nest doorbell', 'nest camera', 'chromecast'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // INTERNET & NETWORKING
  // ============================================================================
  internet: {
    forums: [
      'reddit.com/r/HomeNetworking',
      'reddit.com/r/techsupport',
      'dslreports.com/forums'
    ],
    products: ['wifi', 'internet', 'router', 'modem', 'ethernet', 'network', 'dns', 'ip address', 'connection', 'buffering', 'slow internet', 'no internet'],
    rateLimit: { perMinute: 25, perHour: 180 }
  },
  
  isp: {
    forums: ['reddit.com/r/Comcast_Xfinity', 'reddit.com/r/ATT', 'reddit.com/r/verizon', 'reddit.com/r/tmobile'],
    products: ['comcast', 'xfinity', 'att', 'verizon', 'spectrum', 't-mobile', 'sprint', 'fiber', 'cable internet', 'dsl'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // STREAMING & ENTERTAINMENT
  // ============================================================================
  streaming: {
    forums: ['reddit.com/r/cordcutters', 'reddit.com/r/streaming'],
    products: ['netflix', 'hulu', 'disney plus', 'hbo max', 'amazon prime video', 'peacock', 'paramount plus', 'youtube tv', 'sling', 'fubo'],
    rateLimit: { perMinute: 20, perHour: 150 }
  },
  
  spotify: {
    forums: ['community.spotify.com', 'reddit.com/r/spotify'],
    products: ['spotify', 'spotify premium', 'spotify connect', 'playlist'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },

  // ============================================================================
  // GAMING (Consumer Focus)
  // ============================================================================
  gaming: {
    forums: ['reddit.com/r/gaming', 'reddit.com/r/Games', 'gamefaqs.gamespot.com'],
    products: ['game', 'gaming', 'controller', 'console', 'game crash', 'lag', 'fps drop'],
    rateLimit: { perMinute: 25, perHour: 180 }
  },
  
  playstation: {
    forums: ['reddit.com/r/playstation', 'reddit.com/r/PS5', 'community.playstation.com'],
    products: ['playstation', 'ps5', 'ps4', 'psn', 'playstation network', 'dualshock', 'dualsense'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  xbox: {
    forums: ['reddit.com/r/xbox', 'reddit.com/r/XboxSeriesX', 'answers.microsoft.com/en-us/xbox'],
    products: ['xbox', 'xbox series x', 'xbox series s', 'xbox one', 'xbox live', 'game pass'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  nintendo: {
    forums: ['reddit.com/r/NintendoSwitch', 'reddit.com/r/nintendo', 'gamefaqs.gamespot.com'],
    products: ['nintendo', 'switch', 'nintendo switch', 'joy-con', 'eshop', 'mario', 'zelda', 'pokemon'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // COMPUTERS (Consumer Focus)
  // ============================================================================
  windows: {
    forums: ['answers.microsoft.com/en-us/windows', 'reddit.com/r/Windows10', 'reddit.com/r/Windows11', 'tenforums.com'],
    products: ['windows', 'windows 10', 'windows 11', 'blue screen', 'bsod', 'update', 'start menu', 'taskbar', 'file explorer', 'microsoft store'],
    rateLimit: { perMinute: 25, perHour: 180 }
  },
  
  macos: {
    forums: ['discussions.apple.com', 'reddit.com/r/MacOS', 'macrumors.com/forums'],
    products: ['mac', 'macos', 'finder', 'safari', 'time machine', 'spotlight', 'dock', 'macbook'],
    rateLimit: { perMinute: 25, perHour: 150 }
  },

  // ============================================================================
  // SOFTWARE (Consumer Apps)
  // ============================================================================
  office: {
    forums: ['answers.microsoft.com/en-us/msoffice', 'reddit.com/r/excel', 'reddit.com/r/MicrosoftWord'],
    products: ['excel', 'word', 'powerpoint', 'outlook', 'office 365', 'microsoft 365', 'onedrive', 'sharepoint', 'teams'],
    rateLimit: { perMinute: 25, perHour: 180 }
  },
  
  adobe_consumer: {
    forums: ['community.adobe.com', 'reddit.com/r/AdobeIllustrator', 'reddit.com/r/photoshop'],
    products: ['photoshop', 'lightroom', 'acrobat', 'pdf', 'premiere', 'illustrator', 'adobe reader'],
    rateLimit: { perMinute: 20, perHour: 150 }
  },
  
  browsers: {
    forums: ['reddit.com/r/chrome', 'reddit.com/r/firefox', 'reddit.com/r/edge'],
    products: ['chrome', 'firefox', 'edge', 'safari', 'browser', 'bookmark', 'extension', 'cache', 'cookies', 'popup'],
    rateLimit: { perMinute: 20, perHour: 150 }
  },
  
  antivirus: {
    forums: ['reddit.com/r/antivirus', 'forums.malwarebytes.com', 'community.norton.com'],
    products: ['antivirus', 'malware', 'virus', 'norton', 'mcafee', 'avast', 'windows defender', 'malwarebytes', 'kaspersky'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // E-COMMERCE & SHOPPING
  // ============================================================================
  amazon: {
    forums: ['reddit.com/r/amazon', 'sellercentral.amazon.com/forums'],
    products: ['amazon', 'amazon order', 'prime', 'amazon return', 'amazon shipping', 'amazon payment'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  ebay: {
    forums: ['community.ebay.com', 'reddit.com/r/Ebay'],
    products: ['ebay', 'ebay order', 'ebay seller', 'ebay buyer', 'ebay shipping', 'paypal ebay'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },
  
  etsy: {
    forums: ['community.etsy.com', 'reddit.com/r/Etsy'],
    products: ['etsy', 'etsy order', 'etsy seller', 'etsy payment'],
    rateLimit: { perMinute: 15, perHour: 80 }
  },

  // ============================================================================
  // SOCIAL MEDIA
  // ============================================================================
  social_media: {
    forums: ['reddit.com/r/socialmedia'],
    products: ['social media', 'account locked', 'account hacked', 'login problem', 'two factor', '2fa'],
    rateLimit: { perMinute: 20, perHour: 150 }
  },
  
  facebook: {
    forums: ['reddit.com/r/facebook', 'facebook.com/help/community'],
    products: ['facebook', 'fb', 'messenger', 'facebook marketplace', 'facebook login', 'facebook account'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  instagram: {
    forums: ['reddit.com/r/Instagram', 'help.instagram.com'],
    products: ['instagram', 'ig', 'instagram story', 'instagram reels', 'instagram login'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  twitter: {
    forums: ['reddit.com/r/Twitter', 'help.twitter.com'],
    products: ['twitter', 'x', 'tweet', 'twitter login', 'twitter account'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },
  
  tiktok: {
    forums: ['reddit.com/r/Tiktok', 'support.tiktok.com'],
    products: ['tiktok', 'tiktok video', 'tiktok account', 'tiktok login'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },
  
  whatsapp: {
    forums: ['reddit.com/r/whatsapp', 'faq.whatsapp.com'],
    products: ['whatsapp', 'whatsapp web', 'whatsapp backup', 'whatsapp call'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },

  // ============================================================================
  // TRAVEL & TRANSPORTATION
  // ============================================================================
  travel: {
    forums: ['reddit.com/r/travel', 'flyertalk.com', 'tripadvisor.com/ShowForum'],
    products: ['flight', 'airline', 'booking', 'reservation', 'hotel', 'airbnb', 'travel'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  uber: {
    forums: ['reddit.com/r/uber', 'reddit.com/r/uberdrivers', 'help.uber.com'],
    products: ['uber', 'uber eats', 'uber ride', 'uber driver', 'uber app'],
    rateLimit: { perMinute: 20, perHour: 100 }
  },
  
  lyft: {
    forums: ['reddit.com/r/lyft', 'help.lyft.com'],
    products: ['lyft', 'lyft ride', 'lyft driver', 'lyft app'],
    rateLimit: { perMinute: 15, perHour: 80 }
  },
  
  doordash: {
    forums: ['reddit.com/r/doordash', 'reddit.com/r/doordash_drivers'],
    products: ['doordash', 'door dash', 'dasher', 'delivery'],
    rateLimit: { perMinute: 15, perHour: 80 }
  },

  // ============================================================================
  // HEALTH & FITNESS
  // ============================================================================
  fitness: {
    forums: ['reddit.com/r/fitbit', 'reddit.com/r/AppleWatch', 'reddit.com/r/GarminWatches'],
    products: ['fitbit', 'apple watch', 'garmin', 'fitness tracker', 'step counter', 'heart rate', 'sleep tracker'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  peloton: {
    forums: ['reddit.com/r/pelotoncycle', 'community.onepeloton.com'],
    products: ['peloton', 'peloton bike', 'peloton tread', 'peloton app'],
    rateLimit: { perMinute: 15, perHour: 80 }
  },

  // ============================================================================
  // UTILITIES & BILLS
  // ============================================================================
  utilities: {
    forums: ['reddit.com/r/personalfinance', 'reddit.com/r/Frugal'],
    products: ['electric bill', 'gas bill', 'water bill', 'utility', 'meter', 'power outage', 'billing error'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // HOME REPAIR & DIY
  // ============================================================================
  home_repair: {
    forums: [
      'reddit.com/r/HomeImprovement',
      'reddit.com/r/DIY',
      'reddit.com/r/fixit',
      'doityourself.com/forum'
    ],
    products: ['plumbing', 'electrical', 'drywall', 'paint', 'flooring', 'roof', 'gutter', 'door', 'window', 'lock', 'faucet', 'toilet', 'sink', 'shower', 'bathtub', 'water heater', 'pipe', 'leak', 'clog', 'drain'],
    rateLimit: { perMinute: 25, perHour: 150 }
  },
  
  plumbing: {
    forums: ['reddit.com/r/Plumbing', 'terrylove.com/forums'],
    products: ['plumber', 'pipe', 'faucet', 'toilet', 'water heater', 'drain', 'clog', 'leak', 'sewer', 'septic', 'garbage disposal', 'water pressure', 'hot water'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  electrical: {
    forums: ['reddit.com/r/electricians', 'reddit.com/r/electrical', 'diychatroom.com/forums/electrical'],
    products: ['circuit breaker', 'outlet', 'switch', 'wiring', 'fuse', 'gfci', 'light fixture', 'dimmer', 'electrical panel', 'voltage', 'tripped breaker', 'power outage'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // LAWN & GARDEN
  // ============================================================================
  lawn_garden: {
    forums: ['reddit.com/r/lawncare', 'reddit.com/r/gardening', 'reddit.com/r/landscaping'],
    products: ['lawn mower', 'grass', 'weed', 'fertilizer', 'sprinkler', 'irrigation', 'hedge trimmer', 'leaf blower', 'chainsaw', 'garden', 'plant', 'tree', 'shrub'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  power_tools: {
    forums: ['reddit.com/r/Tools', 'reddit.com/r/powerwashingporn', 'garagejournal.com/forum'],
    products: ['drill', 'saw', 'sander', 'power tool', 'dewalt', 'makita', 'milwaukee', 'ryobi', 'craftsman', 'pressure washer', 'generator'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // KITCHEN APPLIANCES
  // ============================================================================
  kitchen: {
    forums: ['reddit.com/r/Appliances', 'reddit.com/r/KitchenConfidential', 'reddit.com/r/Cooking'],
    products: ['oven', 'stove', 'range', 'cooktop', 'microwave', 'toaster', 'coffee maker', 'keurig', 'nespresso', 'blender', 'food processor', 'instant pot', 'air fryer', 'stand mixer', 'kitchenaid'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  refrigeration: {
    forums: ['reddit.com/r/appliancerepair', 'applianceblog.com/mainforums'],
    products: ['refrigerator', 'fridge', 'freezer', 'ice maker', 'not cooling', 'defrost', 'water dispenser', 'compressor', 'thermostat'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // MEDICAL DEVICES & HEALTH
  // ============================================================================
  medical_devices: {
    forums: ['reddit.com/r/diabetes', 'reddit.com/r/CPAP', 'reddit.com/r/HearingAids'],
    products: ['blood pressure monitor', 'glucose meter', 'cpap', 'hearing aid', 'pulse oximeter', 'thermometer', 'nebulizer', 'insulin pump', 'cgm', 'continuous glucose'],
    rateLimit: { perMinute: 15, perHour: 80 }
  },
  
  pharmacy: {
    forums: ['reddit.com/r/pharmacy', 'reddit.com/r/HealthInsurance'],
    products: ['prescription', 'refill', 'insurance', 'copay', 'pharmacy', 'cvs', 'walgreens', 'medication', 'generic'],
    rateLimit: { perMinute: 15, perHour: 80 }
  },

  // ============================================================================
  // EDUCATION & LEARNING
  // ============================================================================
  education: {
    forums: ['reddit.com/r/college', 'reddit.com/r/GradSchool', 'reddit.com/r/Teachers'],
    products: ['canvas', 'blackboard', 'moodle', 'zoom class', 'google classroom', 'turnitin', 'gradebook', 'lms', 'student portal', 'financial aid', 'fafsa'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  online_learning: {
    forums: ['reddit.com/r/learnprogramming', 'reddit.com/r/coursera', 'reddit.com/r/udemy'],
    products: ['coursera', 'udemy', 'linkedin learning', 'skillshare', 'khan academy', 'duolingo', 'online course', 'certificate'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // PETS & ANIMALS
  // ============================================================================
  pets: {
    forums: ['reddit.com/r/dogs', 'reddit.com/r/cats', 'reddit.com/r/Pets'],
    products: ['pet camera', 'automatic feeder', 'pet tracker', 'gps collar', 'pet door', 'aquarium', 'fish tank', 'pet fountain'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // OFFICE & WORK FROM HOME
  // ============================================================================
  office_equipment: {
    forums: ['reddit.com/r/homeoffice', 'reddit.com/r/WFH', 'reddit.com/r/battlestations'],
    products: ['monitor', 'keyboard', 'mouse', 'webcam', 'headset', 'desk', 'chair', 'standing desk', 'dock', 'usb hub', 'kvm switch'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },
  
  video_conferencing: {
    forums: ['reddit.com/r/Zoom', 'reddit.com/r/MicrosoftTeams', 'reddit.com/r/slack'],
    products: ['zoom', 'teams', 'webex', 'google meet', 'slack', 'skype', 'discord', 'video call', 'screen share', 'microphone not working', 'camera not working'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // SECURITY & SAFETY
  // ============================================================================
  home_security: {
    forums: ['reddit.com/r/homesecurity', 'reddit.com/r/homedefense', 'reddit.com/r/Ring'],
    products: ['ring doorbell', 'nest cam', 'arlo', 'security camera', 'motion sensor', 'alarm system', 'smart lock', 'deadbolt', 'safe', 'smoke detector', 'carbon monoxide'],
    rateLimit: { perMinute: 20, perHour: 120 }
  },

  // ============================================================================
  // BABY & KIDS
  // ============================================================================
  baby_products: {
    forums: ['reddit.com/r/beyondthebump', 'reddit.com/r/Parenting', 'reddit.com/r/NewParents'],
    products: ['baby monitor', 'car seat', 'stroller', 'breast pump', 'bottle warmer', 'baby swing', 'crib', 'bassinet', 'diaper genie', 'baby gate'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // OUTDOOR & RECREATION
  // ============================================================================
  outdoor: {
    forums: ['reddit.com/r/camping', 'reddit.com/r/CampingGear', 'reddit.com/r/Kayaking'],
    products: ['tent', 'sleeping bag', 'camping stove', 'cooler', 'grill', 'bbq', 'smoker', 'kayak', 'bike', 'e-bike', 'scooter', 'hoverboard'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },
  
  pool_spa: {
    forums: ['reddit.com/r/pools', 'reddit.com/r/hottub', 'troublefreepool.com/forums'],
    products: ['pool pump', 'pool filter', 'hot tub', 'spa', 'chlorine', 'pool cleaner', 'pool heater', 'salt water pool'],
    rateLimit: { perMinute: 15, perHour: 80 }
  },

  // ============================================================================
  // WATCHES & JEWELRY
  // ============================================================================
  watches: {
    forums: ['reddit.com/r/Watches', 'reddit.com/r/WatchRepair', 'reddit.com/r/smartwatch'],
    products: ['watch', 'smartwatch', 'fitbit', 'garmin watch', 'apple watch', 'samsung watch', 'rolex', 'seiko', 'watch battery', 'watch band'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // SEWING & CRAFTS
  // ============================================================================
  crafts: {
    forums: ['reddit.com/r/sewing', 'reddit.com/r/quilting', 'reddit.com/r/cricut'],
    products: ['sewing machine', 'singer', 'brother sewing', 'serger', 'cricut', 'silhouette', 'embroidery machine', 'knitting machine'],
    rateLimit: { perMinute: 15, perHour: 80 }
  },

  // ============================================================================
  // MUSICAL INSTRUMENTS
  // ============================================================================
  music: {
    forums: ['reddit.com/r/Guitar', 'reddit.com/r/piano', 'reddit.com/r/WeAreTheMusicMakers'],
    products: ['guitar', 'piano', 'keyboard', 'drums', 'amp', 'amplifier', 'tuner', 'midi', 'audio interface', 'microphone', 'daw'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // FOOD DELIVERY & RESTAURANTS
  // ============================================================================
  food_delivery: {
    forums: ['reddit.com/r/grubhub', 'reddit.com/r/postmates', 'reddit.com/r/UberEats'],
    products: ['grubhub', 'postmates', 'uber eats', 'doordash', 'instacart', 'seamless', 'order wrong', 'delivery late', 'refund', 'missing item'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // INSURANCE
  // ============================================================================
  insurance: {
    forums: ['reddit.com/r/Insurance', 'reddit.com/r/HealthInsurance', 'reddit.com/r/personalfinance'],
    products: ['car insurance', 'home insurance', 'health insurance', 'life insurance', 'claim', 'deductible', 'premium', 'coverage', 'geico', 'state farm', 'progressive', 'allstate'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // TAXES & ACCOUNTING
  // ============================================================================
  taxes: {
    forums: ['reddit.com/r/tax', 'reddit.com/r/taxpros', 'reddit.com/r/personalfinance'],
    products: ['turbotax', 'h&r block', 'tax return', 'irs', 'w2', '1099', 'refund', 'audit', 'quickbooks', 'tax software'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // REAL ESTATE & HOUSING
  // ============================================================================
  real_estate: {
    forums: ['reddit.com/r/RealEstate', 'reddit.com/r/homeowners', 'reddit.com/r/FirstTimeHomeBuyer'],
    products: ['mortgage', 'zillow', 'redfin', 'realtor', 'closing', 'escrow', 'appraisal', 'inspection', 'hoa', 'property tax', 'title'],
    rateLimit: { perMinute: 15, perHour: 100 }
  },

  // ============================================================================
  // GENERAL TECH SUPPORT
  // ============================================================================
  general_tech: {
    forums: [
      'reddit.com/r/techsupport',
      'superuser.com',
      'answers.microsoft.com',
      'support.google.com/community'
    ],
    products: ['error', 'not working', 'crashed', 'frozen', 'slow', 'won\'t start', 'won\'t turn on', 'restart', 'update failed', 'install failed'],
    rateLimit: { perMinute: 30, perHour: 200 }
  }
};

// ============================================================================
// RATE LIMITER FOR FORUM REQUESTS
// ============================================================================

const forumRateLimiter = {
  requests: [],
  
  canMakeRequest() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    
    // Clean old requests
    this.requests = this.requests.filter(t => t > oneHourAgo);
    
    const requestsLastMinute = this.requests.filter(t => t > oneMinuteAgo).length;
    const requestsLastHour = this.requests.length;
    
    return requestsLastMinute < CONFIG.FORUM_RATE_LIMIT.requestsPerMinute &&
           requestsLastHour < CONFIG.FORUM_RATE_LIMIT.requestsPerHour;
  },
  
  recordRequest() {
    this.requests.push(Date.now());
  },
  
  getStats() {
    const now = Date.now();
    return {
      lastMinute: this.requests.filter(t => t > now - 60000).length,
      lastHour: this.requests.filter(t => t > now - 3600000).length,
      limits: CONFIG.FORUM_RATE_LIMIT
    };
  }
};

// In-memory tracking for error patterns
const errorPatternTracker = new Map();

// ============================================================================
// ERROR PATTERN TRACKING
// ============================================================================

/**
 * Track an error occurrence for potential library addition
 */
function trackError(errorData) {
  const {
    errorMessage,
    errorType,
    language,
    category,
    aiResponse,
    userId,
    wasHelpful
  } = errorData;
  
  // Create a normalized pattern key
  const patternKey = normalizeErrorPattern(errorMessage, errorType, language);
  
  if (!errorPatternTracker.has(patternKey)) {
    errorPatternTracker.set(patternKey, {
      pattern: patternKey,
      originalError: errorMessage,
      errorType,
      language,
      category: category || 'general',
      occurrences: 0,
      aiResponses: [],
      helpfulVotes: 0,
      notHelpfulVotes: 0,
      userIds: new Set(),
      firstSeen: new Date(),
      lastSeen: new Date(),
      verificationStatus: 'pending',
      verificationScore: 0,
      sources: []
    });
  }
  
  const tracker = errorPatternTracker.get(patternKey);
  tracker.occurrences++;
  tracker.lastSeen = new Date();
  
  if (userId) {
    tracker.userIds.add(userId);
  }
  
  if (aiResponse && aiResponse.confidence >= CONFIG.MIN_CONFIDENCE_THRESHOLD) {
    tracker.aiResponses.push({
      explanation: aiResponse.explanation,
      solution: aiResponse.solution,
      codeExample: aiResponse.codeExample,
      confidence: aiResponse.confidence,
      timestamp: new Date()
    });
  }
  
  if (wasHelpful === true) {
    tracker.helpfulVotes++;
  } else if (wasHelpful === false) {
    tracker.notHelpfulVotes++;
  }
  
  console.log(`📚 Tracked error pattern: ${patternKey.substring(0, 50)}... (occurrences: ${tracker.occurrences})`);
  
  // Check if eligible for library addition
  checkEligibilityForLibrary(patternKey);
  
  return tracker;
}

/**
 * Normalize error message to create a pattern key
 */
function normalizeErrorPattern(errorMessage, errorType, language) {
  if (!errorMessage) return '';
  
  // Remove variable parts (file paths, line numbers, specific values)
  let normalized = errorMessage
    .toLowerCase()
    // Remove file paths
    .replace(/([a-z]:)?[\\\/][\w\-\.\\\/]+/gi, '<PATH>')
    // Remove line/column numbers
    .replace(/line\s*:?\s*\d+/gi, 'line:<N>')
    .replace(/:\d+:\d+/g, ':<N>:<N>')
    // Remove specific variable names that look generated
    .replace(/\b[a-z_]\w{20,}\b/gi, '<VAR>')
    // Remove UUIDs
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<UUID>')
    // Remove timestamps
    .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/g, '<TIMESTAMP>')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Create pattern key with context
  return `${language || 'unknown'}:${errorType || 'unknown'}:${normalized.substring(0, 200)}`;
}

// ============================================================================
// ELIGIBILITY CHECK & VERIFICATION
// ============================================================================

/**
 * Check if error pattern is eligible for library addition
 */
async function checkEligibilityForLibrary(patternKey) {
  const tracker = errorPatternTracker.get(patternKey);
  if (!tracker) return;
  
  // Check minimum requirements
  if (tracker.occurrences < CONFIG.MIN_ERROR_OCCURRENCES) {
    return; // Not enough occurrences yet
  }
  
  if (tracker.aiResponses.length === 0) {
    return; // No AI responses to use
  }
  
  if (tracker.verificationStatus === 'verified' || tracker.verificationStatus === 'rejected') {
    return; // Already processed
  }
  
  // Check if already in library
  const existingEntry = await ErrorLibrary.findOne({
    where: {
      errorCode: tracker.errorType,
      type: 'system',
      isActive: true
    }
  });
  
  if (existingEntry) {
    // Update existing entry's metrics instead
    await existingEntry.increment('useCount', { by: tracker.occurrences });
    tracker.verificationStatus = 'exists';
    return;
  }
  
  // Calculate eligibility score
  const score = calculateEligibilityScore(tracker);
  tracker.verificationScore = score;
  
  console.log(`🔍 Checking eligibility: ${patternKey.substring(0, 50)}... Score: ${score.toFixed(2)}`);
  
  if (score >= CONFIG.AUTO_APPROVE_SCORE) {
    // High confidence - auto approve
    await addToLibrary(tracker, 'auto-approved');
  } else if (score >= 0.6) {
    // Medium confidence - queue for verification
    tracker.verificationStatus = 'queued';
    console.log(`📋 Queued for verification: ${tracker.originalError.substring(0, 50)}...`);
  }
}

/**
 * Calculate eligibility score for library addition
 */
function calculateEligibilityScore(tracker) {
  let score = 0;
  
  // Factor 1: Occurrence frequency (max 0.3)
  const occurrenceScore = Math.min(tracker.occurrences / 20, 1) * 0.3;
  score += occurrenceScore;
  
  // Factor 2: AI confidence average (max 0.3)
  if (tracker.aiResponses.length > 0) {
    const avgConfidence = tracker.aiResponses.reduce((sum, r) => sum + r.confidence, 0) / tracker.aiResponses.length;
    score += avgConfidence * 0.3;
  }
  
  // Factor 3: Helpful ratio (max 0.2)
  const totalVotes = tracker.helpfulVotes + tracker.notHelpfulVotes;
  if (totalVotes > 0) {
    const helpfulRatio = tracker.helpfulVotes / totalVotes;
    score += helpfulRatio * 0.2;
  } else {
    // No votes yet, neutral score
    score += 0.1;
  }
  
  // Factor 4: Unique users (max 0.2)
  const uniqueUserScore = Math.min(tracker.userIds.size / 10, 1) * 0.2;
  score += uniqueUserScore;
  
  return score;
}

// ============================================================================
// PRODUCT DETECTION & FORUM VERIFICATION
// ============================================================================

/**
 * Detect product/category from error message and context
 * Works for everyday users: banking, vehicles, electronics, appliances, etc.
 */
function detectProductFromError(errorMessage, additionalContext = {}) {
  const errorLower = (errorMessage || '').toLowerCase();
  const contextLower = JSON.stringify(additionalContext || {}).toLowerCase();
  const combined = errorLower + ' ' + contextLower;
  
  const detectedProducts = [];
  const matchedVendors = new Set();
  
  // Check against all forum sources
  for (const [vendor, config] of Object.entries(FORUM_SOURCES)) {
    // Skip if already matched this vendor
    if (matchedVendors.has(vendor)) continue;
    
    for (const product of config.products) {
      const productLower = product.toLowerCase();
      // Use word boundary check for better matching
      const regex = new RegExp(`\\b${productLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      
      if (regex.test(combined) || combined.includes(productLower)) {
        matchedVendors.add(vendor);
        detectedProducts.push({
          vendor,
          product,
          forums: config.forums,
          rateLimit: config.rateLimit || { perMinute: 30, perHour: 200 }
        });
        break; // One match per vendor is enough
      }
    }
  }
  
  // Additional context-based detection for common error patterns
  const contextPatterns = {
    // Banking & Finance patterns
    banking: /\b(transaction|declined|insufficient|overdraft|routing number|account number|wire|ach|direct deposit|atm pin|card blocked|bank error|transfer failed|statement)\b/i,
    paypal: /\b(paypal|venmo|payment failed|checkout error|paypal hold|venmo declined)\b/i,
    cryptocurrency: /\b(wallet|blockchain|crypto|bitcoin|ethereum|coinbase|binance|transfer pending|gas fee)\b/i,
    
    // Vehicle & Automotive patterns
    automotive: /\b(engine light|check engine|transmission|brake warning|oil pressure|airbag light|abs light|coolant|overheating|won't start|battery dead|alternator|starter|car trouble|vehicle issue|mechanic)\b/i,
    motorcycle: /\b(motorcycle|harley|motorbike|bike won't start|carburetor|clutch|exhaust)\b/i,
    
    // Home Appliance patterns
    appliances: /\b(not draining|not spinning|not heating|not cooling|error code|beeping|leaking|won't turn on|making noise|washer error|dryer error)\b/i,
    hvac: /\b(thermostat|furnace|ac unit|compressor|refrigerant|filter|ductwork|heating system|cooling system|air conditioner|heat pump)\b/i,
    refrigeration: /\b(fridge|refrigerator|freezer|ice maker|not cold|defrost|compressor running)\b/i,
    kitchen: /\b(oven|stove|microwave|dishwasher|coffee maker|keurig|instant pot|air fryer|blender)\b/i,
    
    // Electronics patterns
    smartphone: /\b(screen frozen|app crash|battery drain|won't charge|touch screen|face id|fingerprint|sim card|no signal|phone error|iphone|android|galaxy)\b/i,
    tv: /\b(no picture|no sound|black screen|flickering|hdmi|remote not working|smart tv|roku|fire stick|chromecast)\b/i,
    printer: /\b(paper jam|print queue|offline|ink|toner|spooler|printer error|won't print|hp printer|epson|canon printer)\b/i,
    laptop: /\b(laptop|notebook|won't boot|overheating laptop|battery not charging|keyboard not working|touchpad|screen flicker)\b/i,
    audio: /\b(headphones|earbuds|bluetooth speaker|no audio|sound not working|airpods|speaker crackling)\b/i,
    camera: /\b(camera error|lens error|sd card|memory card|photo corrupt|gopro|dslr)\b/i,
    
    // Internet & Network patterns
    internet: /\b(no internet|wifi not working|slow connection|buffering|router|modem|dns|ip address|connection timeout|network error)\b/i,
    isp: /\b(comcast|xfinity|spectrum|att|verizon|t-mobile|internet outage|service down)\b/i,
    
    // Social Media patterns
    social_media: /\b(account locked|can't login|suspended|hacked|two factor|verification code|password reset|account recovery)\b/i,
    facebook: /\b(facebook|fb|messenger|facebook marketplace|facebook login)\b/i,
    instagram: /\b(instagram|ig|instagram story|reels|instagram error)\b/i,
    
    // Streaming & Entertainment patterns
    streaming: /\b(buffering|playback error|stream quality|audio sync|subtitle|content unavailable|won't play)\b/i,
    spotify: /\b(spotify|playlist|spotify connect|spotify error|songs won't play)\b/i,
    
    // Home Repair patterns
    home_repair: /\b(plumbing|electrical|drywall|paint|flooring|roof|gutter|door|window|lock|leak|clog)\b/i,
    plumbing: /\b(toilet|faucet|pipe|drain|clog|leak|water heater|no hot water|low pressure|sewer|garbage disposal)\b/i,
    electrical: /\b(circuit breaker|outlet|switch|wiring|fuse|gfci|light fixture|dimmer|tripped|power out)\b/i,
    
    // Lawn & Outdoor patterns
    lawn_garden: /\b(lawn mower|grass|weed|sprinkler|irrigation|chainsaw|leaf blower|won't start)\b/i,
    pool_spa: /\b(pool pump|pool filter|hot tub|spa|chlorine|pool heater|pool cleaner)\b/i,
    
    // Office & Work patterns
    office_equipment: /\b(monitor|keyboard|mouse|webcam|headset|dock|usb hub|desk setup)\b/i,
    video_conferencing: /\b(zoom|teams|webex|google meet|video call|screen share|mic not working|camera not working)\b/i,
    
    // Medical & Health patterns
    medical_devices: /\b(blood pressure|glucose meter|cpap|hearing aid|pulse oximeter|insulin pump|cgm)\b/i,
    fitness: /\b(fitbit|apple watch|garmin|fitness tracker|step counter|heart rate|sleep tracker)\b/i,
    
    // Shopping & Delivery patterns
    amazon: /\b(amazon|prime|amazon order|amazon return|shipping|tracking)\b/i,
    food_delivery: /\b(doordash|uber eats|grubhub|postmates|instacart|order wrong|delivery late|missing item)\b/i,
    
    // Travel patterns
    travel: /\b(flight|airline|booking|reservation|hotel|airbnb|travel|rental car)\b/i,
    uber: /\b(uber|lyft|ride share|driver|uber eats|uber app)\b/i,
    
    // Baby & Kids patterns
    baby_products: /\b(baby monitor|car seat|stroller|breast pump|crib|baby gate)\b/i,
    
    // Security patterns
    home_security: /\b(ring doorbell|nest cam|arlo|security camera|motion sensor|alarm|smart lock|smoke detector)\b/i,
    
    // Smart Home patterns
    smarthome: /\b(alexa|google home|smart plug|smart light|smart lock|ring|hue|zigbee)\b/i,
    
    // Gaming (consumer) patterns
    gaming: /\b(game crash|lag|fps drop|controller|won't load|multiplayer|online|co-op)\b/i,
    playstation: /\b(playstation|ps5|ps4|psn|dualshock|dualsense)\b/i,
    xbox: /\b(xbox|xbox series|xbox one|xbox live|game pass)\b/i,
    nintendo: /\b(nintendo|switch|joy-con|eshop)\b/i,
    
    // Financial patterns
    insurance: /\b(insurance|claim|deductible|premium|coverage|geico|state farm|progressive|denied claim)\b/i,
    taxes: /\b(turbotax|tax return|irs|refund|w2|1099|h&r block|quickbooks)\b/i,
    real_estate: /\b(mortgage|zillow|redfin|realtor|closing|escrow|appraisal|hoa)\b/i,
    
    // Education patterns
    education: /\b(canvas|blackboard|moodle|zoom class|google classroom|turnitin|student portal|fafsa)\b/i,
    
    // General tech patterns
    windows: /\b(windows|blue screen|bsod|windows update|start menu|taskbar|microsoft store)\b/i,
    macos: /\b(mac|macos|finder|time machine|spotlight|dock|macbook)\b/i,
    office: /\b(excel|word|powerpoint|outlook|office 365|microsoft 365|onedrive|teams)\b/i,
    general_tech: /\b(crashed|frozen|not responding|update failed|install error|driver|reboot loop|slow computer|virus|malware)\b/i
  };
  
  for (const [vendor, pattern] of Object.entries(contextPatterns)) {
    if (pattern.test(combined) && !matchedVendors.has(vendor)) {
      const config = FORUM_SOURCES[vendor];
      if (config) {
        matchedVendors.add(vendor);
        detectedProducts.push({
          vendor,
          product: 'auto-detected',
          forums: config.forums,
          rateLimit: config.rateLimit || { perMinute: 30, perHour: 200 }
        });
      }
    }
  }
  
  // If no specific product detected, try general categories based on category hint
  if (detectedProducts.length === 0 && additionalContext.category) {
    const categoryMappings = {
      'payment': ['banking', 'paypal', 'cryptocurrency'],
      'website': ['browsers', 'internet'],
      'gaming': ['gaming', 'playstation', 'xbox', 'nintendo'],
      'mobile': ['smartphone', 'apple'],
      'software': ['windows', 'office', 'adobe_consumer'],
      'network': ['internet', 'isp'],
      'database': ['general_tech'],
      'authentication': ['social_media', 'banking'],
      'api': ['general_tech'],
      'appliances': ['appliances', 'hvac', 'refrigeration', 'kitchen'],
      'automotive': ['automotive', 'toyota', 'honda', 'ford'],
      'home': ['home_repair', 'plumbing', 'electrical', 'home_security'],
      'health': ['medical_devices', 'fitness', 'pharmacy'],
      'finance': ['banking', 'insurance', 'taxes', 'real_estate'],
      'general': ['general_tech']
    };
    
    const vendorsToCheck = categoryMappings[additionalContext.category] || ['general_tech'];
    for (const vendor of vendorsToCheck) {
      const config = FORUM_SOURCES[vendor];
      if (config && !matchedVendors.has(vendor)) {
        detectedProducts.push({
          vendor,
          product: 'category-based',
          forums: config.forums,
          rateLimit: config.rateLimit || { perMinute: 30, perHour: 200 }
        });
      }
    }
  }
  
  // Always include general tech as fallback
  if (detectedProducts.length === 0) {
    const generalConfig = FORUM_SOURCES.general_tech;
    if (generalConfig) {
      detectedProducts.push({
        vendor: 'general_tech',
        product: 'fallback',
        forums: generalConfig.forums,
        rateLimit: generalConfig.rateLimit
      });
    }
  }
  
  console.log(`🔎 Detected ${detectedProducts.length} product categories: ${detectedProducts.map(p => p.vendor).join(', ')}`);
  
  return detectedProducts;
}

/**
 * Search product-specific forums
 * Handles Reddit, StackExchange, manufacturer forums, and community sites
 */
async function searchProductForums(errorMessage, productInfo) {
  const results = [];
  
  for (const forum of productInfo.forums) {
    // Check rate limit
    if (!forumRateLimiter.canMakeRequest()) {
      console.log(`⏳ Rate limited, skipping forum: ${forum}`);
      continue;
    }
    
    try {
      const searchTerms = extractSearchTerms(errorMessage);
      let forumResults = [];
      
      // Route to appropriate search handler based on forum type
      if (forum.includes('reddit.com')) {
        forumResults = await searchReddit(searchTerms, forum);
      } else if (forum.includes('stackoverflow.com') || forum.includes('stackexchange.com') || forum.includes('superuser.com')) {
        forumResults = await searchStackExchange(searchTerms, forum);
      } else if (forum.includes('github.com')) {
        forumResults = await searchGitHubIssues(errorMessage, productInfo.product);
      } else if (forum.includes('community.') || forum.includes('forums.') || forum.includes('support.')) {
        forumResults = await searchCommunityForum(searchTerms, forum, productInfo.vendor);
      } else if (forum.includes('ifixit.com')) {
        forumResults = await searchIFixit(searchTerms);
      } else {
        // Generic search link for other forums
        forumResults = await searchGenericForum(forum, searchTerms);
      }
      
      forumRateLimiter.recordRequest();
      
      if (forumResults.length > 0) {
        results.push({
          forum,
          vendor: productInfo.vendor,
          product: productInfo.product,
          results: forumResults,
          topResult: forumResults[0]
        });
      }
      
      // Small delay between forum searches
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.warn(`Forum search failed for ${forum}:`, error.message);
    }
  }
  
  return results;
}

/**
 * Search Reddit for solutions
 */
async function searchReddit(searchTerms, subredditUrl) {
  try {
    // Extract subreddit from URL
    const subredditMatch = subredditUrl.match(/reddit\.com\/r\/(\w+)/);
    const subreddit = subredditMatch ? subredditMatch[1] : '';
    
    // Reddit search via JSON API (no auth needed for public)
    const query = encodeURIComponent(searchTerms);
    const url = subreddit 
      ? `https://www.reddit.com/r/${subreddit}/search.json?q=${query}&restrict_sr=1&limit=5&sort=relevance`
      : `https://www.reddit.com/search.json?q=${query}&limit=5&sort=relevance`;
    
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'ErrorWise/1.0 (Learning Service)' }
    });
    
    if (response.data?.data?.children) {
      return response.data.data.children.slice(0, 5).map(post => ({
        title: post.data.title,
        link: `https://reddit.com${post.data.permalink}`,
        source: `r/${post.data.subreddit}`,
        score: post.data.score,
        comments: post.data.num_comments,
        isSearchLink: false
      }));
    }
  } catch (error) {
    console.warn('Reddit search failed:', error.message);
  }
  
  // Fallback to search link
  return [{
    title: `Search Reddit for: ${searchTerms.substring(0, 50)}`,
    link: `https://www.reddit.com/search/?q=${encodeURIComponent(searchTerms)}`,
    source: 'reddit',
    isSearchLink: true
  }];
}

/**
 * Search StackExchange network (StackOverflow, SuperUser, etc.)
 */
async function searchStackExchange(searchTerms, siteUrl) {
  try {
    // Determine which StackExchange site
    let site = 'stackoverflow';
    if (siteUrl.includes('superuser')) site = 'superuser';
    else if (siteUrl.includes('askubuntu')) site = 'askubuntu';
    else if (siteUrl.includes('serverfault')) site = 'serverfault';
    else if (siteUrl.includes('dba.stackexchange')) site = 'dba';
    
    const query = encodeURIComponent(searchTerms);
    const response = await axios.get(
      `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${query}&site=${site}&filter=withbody&pagesize=5`,
      { timeout: 5000 }
    );
    
    if (response.data?.items) {
      return response.data.items.slice(0, 5).map(item => ({
        title: item.title,
        link: item.link,
        source: site,
        score: item.score,
        isAnswered: item.is_answered,
        answerCount: item.answer_count,
        isSearchLink: false
      }));
    }
  } catch (error) {
    console.warn('StackExchange search failed:', error.message);
  }
  
  return [];
}

/**
 * Search iFixit for repair guides
 */
async function searchIFixit(searchTerms) {
  try {
    const query = encodeURIComponent(searchTerms);
    
    // iFixit doesn't have a public API, return search link
    return [{
      title: `Search iFixit Repair Guides: ${searchTerms.substring(0, 40)}`,
      link: `https://www.ifixit.com/Search?query=${query}`,
      source: 'ifixit',
      isSearchLink: true,
      description: 'Free repair guides and troubleshooting'
    }];
  } catch (error) {
    console.warn('iFixit search failed:', error.message);
    return [];
  }
}

/**
 * Search community/manufacturer forums
 */
async function searchCommunityForum(searchTerms, forumUrl, vendor) {
  try {
    const query = encodeURIComponent(searchTerms);
    const baseUrl = forumUrl.startsWith('http') ? forumUrl : `https://${forumUrl}`;
    
    // Generate search URL based on common forum patterns
    let searchUrl = '';
    
    if (forumUrl.includes('community.samsung')) {
      searchUrl = `https://us.community.samsung.com/t5/forums/searchpage/tab/message?q=${query}`;
    } else if (forumUrl.includes('discussions.apple')) {
      searchUrl = `https://discussions.apple.com/search?q=${query}`;
    } else if (forumUrl.includes('answers.microsoft')) {
      searchUrl = `https://answers.microsoft.com/en-us/search/search?SearchTerm=${query}`;
    } else if (forumUrl.includes('community.adobe')) {
      searchUrl = `https://community.adobe.com/t5/forums/searchpage/tab/message?q=${query}`;
    } else {
      // Try common search URL patterns
      searchUrl = `https://www.google.com/search?q=site:${forumUrl}+${query}`;
    }
    
    return [{
      title: `Search ${vendor} Community: ${searchTerms.substring(0, 40)}`,
      link: searchUrl,
      source: forumUrl,
      vendor: vendor,
      isSearchLink: true
    }];
  } catch (error) {
    console.warn('Community forum search failed:', error.message);
    return [];
  }
}

/**
 * Search Adobe Community forums
 */
async function searchAdobeCommunity(errorMessage, product) {
  try {
    const searchTerms = extractSearchTerms(errorMessage);
    const productFilter = product !== 'auto-detected' ? product : '';
    
    // Adobe Community doesn't have a public API, so we'd use a search engine
    // For now, return placeholder that redirects to community search
    return [{
      title: `Search Adobe Community for: ${searchTerms.substring(0, 50)}`,
      link: `https://community.adobe.com/t5/forums/searchpage/tab/message?q=${encodeURIComponent(searchTerms + ' ' + productFilter)}`,
      source: 'adobe-community',
      isSearchLink: true
    }];
  } catch (error) {
    console.warn('Adobe Community search failed:', error.message);
    return [];
  }
}

/**
 * Search Microsoft Answers forums
 */
async function searchMicrosoftAnswers(errorMessage, product) {
  try {
    const searchTerms = extractSearchTerms(errorMessage);
    
    return [{
      title: `Search Microsoft Answers for: ${searchTerms.substring(0, 50)}`,
      link: `https://answers.microsoft.com/en-us/search/search?SearchTerm=${encodeURIComponent(searchTerms)}`,
      source: 'microsoft-answers',
      isSearchLink: true
    }];
  } catch (error) {
    console.warn('Microsoft Answers search failed:', error.message);
    return [];
  }
}

/**
 * Search Apple Discussions
 */
async function searchAppleDiscussions(errorMessage, product) {
  try {
    const searchTerms = extractSearchTerms(errorMessage);
    
    return [{
      title: `Search Apple Discussions for: ${searchTerms.substring(0, 50)}`,
      link: `https://discussions.apple.com/search?q=${encodeURIComponent(searchTerms)}`,
      source: 'apple-discussions',
      isSearchLink: true
    }];
  } catch (error) {
    console.warn('Apple Discussions search failed:', error.message);
    return [];
  }
}

/**
 * Generic forum search (fallback)
 */
async function searchGenericForum(forum, searchTerms) {
  try {
    return [{
      title: `Search ${forum} for: ${searchTerms.substring(0, 50)}`,
      link: `https://www.google.com/search?q=site:${encodeURIComponent(forum)}+${encodeURIComponent(searchTerms)}`,
      source: forum,
      isSearchLink: true
    }];
  } catch (error) {
    console.warn('Generic forum search failed:', error.message);
    return [];
  }
}

// ============================================================================
// INTERNET VERIFICATION (WITH PRODUCT-SPECIFIC FORUMS)
// ============================================================================

/**
 * Verify solution against internet sources (including product-specific forums)
 */
async function verifyFromInternetSources(tracker) {
  const sources = [];
  let verificationScore = 0;
  
  try {
    // Step 1: Detect product from error
    const detectedProducts = detectProductFromError(tracker.originalError, {
      language: tracker.language,
      category: tracker.category
    });
    
    console.log(`🔎 Detected products: ${detectedProducts.map(p => p.vendor + ':' + p.product).join(', ') || 'none'}`);
    
    // Step 2: Search product-specific forums FIRST
    for (const productInfo of detectedProducts) {
      const forumResults = await searchProductForums(tracker.originalError, productInfo);
      
      for (const result of forumResults) {
        sources.push({
          source: result.forum,
          type: 'product-forum',
          vendor: result.vendor,
          product: result.product,
          results: result.results.length,
          topResult: result.topResult
        });
        
        // Higher weight for product-specific forums
        verificationScore += result.results.some(r => !r.isSearchLink) ? 0.35 : 0.15;
      }
      
      // Rate limit between products
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Step 3: Search Stack Overflow (general programming)
    const stackOverflowResults = await searchStackOverflow(tracker.originalError);
    if (stackOverflowResults.length > 0) {
      sources.push({
        source: 'stackoverflow',
        type: 'general',
        results: stackOverflowResults.length,
        topResult: stackOverflowResults[0]
      });
      verificationScore += 0.2;
    }
    
    // Step 4: Search GitHub Issues
    const githubResults = await searchGitHubIssues(tracker.originalError, tracker.language);
    if (githubResults.length > 0) {
      sources.push({
        source: 'github',
        type: 'general',
        results: githubResults.length,
        topResult: githubResults[0]
      });
      verificationScore += 0.15;
    }
    
    // Step 5: Check official documentation
    const docResults = await searchOfficialDocs(tracker.originalError, tracker.language);
    if (docResults.found) {
      sources.push({
        source: 'official-docs',
        type: 'documentation',
        url: docResults.url,
        title: docResults.title
      });
      verificationScore += 0.15;
    }
    
  } catch (error) {
    console.error('Internet verification error:', error.message);
  }
  
  tracker.sources = sources;
  tracker.verificationScore = Math.max(tracker.verificationScore, verificationScore);
  tracker.detectedProducts = detectProductFromError(tracker.originalError);
  
  return {
    verified: verificationScore >= 0.5,
    score: verificationScore,
    sources,
    products: tracker.detectedProducts
  };
}

/**
 * Search Stack Overflow for similar errors
 */
async function searchStackOverflow(errorMessage) {
  try {
    // Extract key terms from error
    const searchTerms = extractSearchTerms(errorMessage);
    const query = encodeURIComponent(searchTerms);
    
    const response = await axios.get(
      `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${query}&site=stackoverflow&filter=withbody`,
      { timeout: 5000 }
    );
    
    if (response.data && response.data.items) {
      return response.data.items.slice(0, 5).map(item => ({
        title: item.title,
        link: item.link,
        score: item.score,
        isAnswered: item.is_answered,
        answerCount: item.answer_count
      }));
    }
  } catch (error) {
    console.warn('Stack Overflow search failed:', error.message);
  }
  
  return [];
}

/**
 * Search GitHub Issues for similar errors
 */
async function searchGitHubIssues(errorMessage, language) {
  try {
    const searchTerms = extractSearchTerms(errorMessage);
    const languageFilter = language ? `+language:${language}` : '';
    const query = encodeURIComponent(`${searchTerms}${languageFilter}`);
    
    const response = await axios.get(
      `https://api.github.com/search/issues?q=${query}+type:issue&per_page=5`,
      { 
        timeout: 5000,
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ErrorWise-Learning-Service'
        }
      }
    );
    
    if (response.data && response.data.items) {
      return response.data.items.map(item => ({
        title: item.title,
        url: item.html_url,
        state: item.state,
        comments: item.comments
      }));
    }
  } catch (error) {
    console.warn('GitHub search failed:', error.message);
  }
  
  return [];
}

/**
 * Search official documentation
 */
async function searchOfficialDocs(errorMessage, language) {
  // Map languages to their documentation sites
  const docSites = {
    javascript: 'developer.mozilla.org',
    typescript: 'typescriptlang.org/docs',
    python: 'docs.python.org',
    java: 'docs.oracle.com/javase',
    csharp: 'learn.microsoft.com/dotnet',
    go: 'go.dev/doc',
    rust: 'doc.rust-lang.org',
    react: 'react.dev',
    node: 'nodejs.org/docs',
    vue: 'vuejs.org/guide',
    angular: 'angular.io/docs'
  };
  
  const docSite = docSites[language?.toLowerCase()] || null;
  
  if (docSite) {
    return {
      found: true,
      url: `https://${docSite}`,
      title: `Official ${language} Documentation`
    };
  }
  
  return { found: false };
}

/**
 * Extract search terms from error message
 */
function extractSearchTerms(errorMessage) {
  if (!errorMessage) return '';
  
  // Remove noise and extract meaningful terms
  return errorMessage
    .replace(/[^\w\s:]/g, ' ')
    .replace(/\b(error|exception|failed|cannot|unable)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

// ============================================================================
// USER-SPECIFIC SOLUTIONS (Separate from system library)
// ============================================================================

/**
 * Save user's own solution (different from system library)
 */
async function saveUserSolution(userId, errorData, solutionData) {
  try {
    // Check if user already has this solution saved
    const existingEntry = await ErrorLibrary.findOne({
      where: {
        userId,
        type: 'user',
        errorPattern: normalizeErrorPattern(errorData.errorMessage)
      }
    });
    
    if (existingEntry) {
      // Update existing user solution
      await existingEntry.update({
        solution: solutionData.solution,
        explanation: solutionData.explanation || existingEntry.explanation,
        notes: solutionData.notes || existingEntry.notes,
        sourceUrl: solutionData.sourceUrl || existingEntry.sourceUrl,
        lastModified: new Date()
      });
      
      console.log(`📝 Updated user solution: ${existingEntry.id} for user ${userId}`);
      return { updated: true, entry: existingEntry };
    }
    
    // Create new user solution
    const entry = await ErrorLibrary.create({
      type: 'user', // User-saved solution
      userId,
      errorCode: generateErrorCode({ 
        pattern: normalizeErrorPattern(errorData.errorMessage),
        language: errorData.language
      }),
      errorPattern: normalizeErrorPattern(errorData.errorMessage),
      title: solutionData.title || generateTitle(errorData.errorMessage, errorData.errorType),
      errorMessage: errorData.errorMessage,
      category: mapCategory(errorData.category),
      explanation: solutionData.explanation,
      solution: solutionData.solution,
      notes: solutionData.notes, // User's personal notes
      sourceUrl: solutionData.sourceUrl, // Link to forum/source
      tags: solutionData.tags || generateTags({
        language: errorData.language,
        errorType: errorData.errorType,
        category: errorData.category,
        originalError: errorData.errorMessage
      }),
      difficulty: solutionData.difficulty || 'medium',
      isPublic: false, // User solutions are private by default
      isActive: true
    });
    
    console.log(`✅ Saved user solution: ${entry.id} for user ${userId}`);
    return { created: true, entry };
    
  } catch (error) {
    console.error('Failed to save user solution:', error.message);
    throw error;
  }
}

/**
 * Get user's saved solutions with optional filtering
 */
async function getUserSolutions(userId, filters = {}) {
  try {
    const where = {
      userId,
      type: 'user',
      isActive: true
    };
    
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${filters.search}%` } },
        { errorMessage: { [Op.iLike]: `%${filters.search}%` } },
        { solution: { [Op.iLike]: `%${filters.search}%` } }
      ];
    }
    
    const solutions = await ErrorLibrary.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: filters.limit || 50
    });
    
    return solutions;
    
  } catch (error) {
    console.error('Failed to get user solutions:', error.message);
    throw error;
  }
}

/**
 * Get combined library entries (system + user) for search
 * User solutions appear first, clearly marked
 */
async function getCombinedLibrary(userId, searchQuery) {
  try {
    const searchPattern = `%${searchQuery}%`;
    
    // Get user's solutions first
    const userSolutions = await ErrorLibrary.findAll({
      where: {
        userId,
        type: 'user',
        isActive: true,
        [Op.or]: [
          { title: { [Op.iLike]: searchPattern } },
          { errorMessage: { [Op.iLike]: searchPattern } },
          { solution: { [Op.iLike]: searchPattern } },
          { tags: { [Op.contains]: [searchQuery.toLowerCase()] } }
        ]
      },
      order: [['helpfulCount', 'DESC']],
      limit: 10
    });
    
    // Get system solutions
    const systemSolutions = await ErrorLibrary.findAll({
      where: {
        type: 'system',
        isActive: true,
        isPublic: true,
        [Op.or]: [
          { title: { [Op.iLike]: searchPattern } },
          { errorMessage: { [Op.iLike]: searchPattern } },
          { solution: { [Op.iLike]: searchPattern } },
          { tags: { [Op.contains]: [searchQuery.toLowerCase()] } }
        ]
      },
      order: [['helpfulCount', 'DESC'], ['viewCount', 'DESC']],
      limit: 20
    });
    
    // Combine with clear differentiation
    return {
      userSolutions: userSolutions.map(s => ({
        ...s.toJSON(),
        isUserSaved: true,
        label: 'Your Solution'
      })),
      systemSolutions: systemSolutions.map(s => ({
        ...s.toJSON(),
        isUserSaved: false,
        label: s.sourceUrl ? 'Verified from Community' : 'System Library'
      }))
    };
    
  } catch (error) {
    console.error('Failed to get combined library:', error.message);
    throw error;
  }
}

/**
 * Delete user's solution
 */
async function deleteUserSolution(userId, entryId) {
  try {
    const entry = await ErrorLibrary.findOne({
      where: {
        id: entryId,
        userId,
        type: 'user'
      }
    });
    
    if (!entry) {
      return { success: false, message: 'Solution not found or not owned by user' };
    }
    
    await entry.update({ isActive: false });
    console.log(`🗑️ Deleted user solution: ${entryId} for user ${userId}`);
    
    return { success: true, message: 'Solution deleted' };
    
  } catch (error) {
    console.error('Failed to delete user solution:', error.message);
    throw error;
  }
}

// ============================================================================
// LIBRARY ADDITION (System learned entries)
// ============================================================================

/**
 * Add verified error pattern to library
 */
async function addToLibrary(tracker, approvalType = 'manual') {
  try {
    // Get best AI response
    const bestResponse = tracker.aiResponses.reduce((best, current) => 
      current.confidence > (best?.confidence || 0) ? current : best
    , null);
    
    if (!bestResponse) {
      console.warn('No AI response available for library addition');
      return null;
    }
    
    // Create library entry
    const entry = await ErrorLibrary.create({
      type: 'system', // System-learned entry
      errorCode: tracker.errorType || generateErrorCode(tracker),
      errorPattern: tracker.pattern,
      title: generateTitle(tracker.originalError, tracker.errorType),
      errorMessage: tracker.originalError,
      category: mapCategory(tracker.category),
      explanation: bestResponse.explanation,
      solution: bestResponse.solution,
      commonCauses: extractCommonCauses(tracker.aiResponses),
      tags: generateTags(tracker),
      difficulty: determineDifficulty(tracker),
      sourceUrl: tracker.sources[0]?.topResult?.link || tracker.sources[0]?.url || null,
      lastVerified: new Date(),
      isPublic: true,
      isActive: true,
      viewCount: tracker.occurrences,
      helpfulCount: tracker.helpfulVotes
    });
    
    tracker.verificationStatus = 'verified';
    tracker.libraryEntryId = entry.id;
    
    console.log(`✅ Added to library [${approvalType}]: ${entry.title} (ID: ${entry.id})`);
    
    return entry;
    
  } catch (error) {
    console.error('Failed to add to library:', error.message);
    tracker.verificationStatus = 'failed';
    return null;
  }
}

/**
 * Generate a unique error code
 */
function generateErrorCode(tracker) {
  const prefix = (tracker.language || 'GEN').substring(0, 3).toUpperCase();
  const hash = tracker.pattern.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 10000;
  return `${prefix}_${hash.toString().padStart(4, '0')}`;
}

/**
 * Generate a human-readable title
 */
function generateTitle(errorMessage, errorType) {
  // Extract the main error type/message
  const patterns = [
    /^(\w+Error):/i,
    /^(\w+Exception):/i,
    /^(Error\s*\d+)/i,
    /^(HTTP\s*\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  // Use error type or truncate message
  if (errorType) {
    return errorType.charAt(0).toUpperCase() + errorType.slice(1) + ' Error';
  }
  
  return errorMessage.substring(0, 60) + (errorMessage.length > 60 ? '...' : '');
}

// ============================================================================
// SMART CATEGORIZATION SYSTEM
// Comprehensive categories covering all domains
// ============================================================================

const SMART_CATEGORIES = {
  // === TECHNOLOGY & PROGRAMMING ===
  programming: {
    name: 'Programming',
    subcategories: ['javascript', 'python', 'java', 'csharp', 'cpp', 'go', 'rust', 'php', 'ruby', 'swift', 'kotlin', 'typescript'],
    keywords: ['code', 'function', 'variable', 'error', 'exception', 'bug', 'debug', 'compile', 'runtime', 'syntax']
  },
  web_development: {
    name: 'Web Development',
    subcategories: ['frontend', 'backend', 'fullstack', 'html', 'css', 'react', 'angular', 'vue', 'node', 'express', 'django', 'flask'],
    keywords: ['website', 'webpage', 'browser', 'http', 'https', 'api', 'rest', 'graphql', 'cors', 'dom']
  },
  mobile_development: {
    name: 'Mobile Development',
    subcategories: ['ios', 'android', 'react-native', 'flutter', 'swift', 'kotlin'],
    keywords: ['app', 'mobile', 'phone', 'tablet', 'notification', 'push']
  },
  database: {
    name: 'Database',
    subcategories: ['sql', 'nosql', 'postgresql', 'mysql', 'mongodb', 'redis', 'sqlite', 'oracle'],
    keywords: ['query', 'table', 'column', 'index', 'transaction', 'connection', 'migration']
  },
  devops: {
    name: 'DevOps & Cloud',
    subcategories: ['docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci-cd', 'jenkins', 'github-actions'],
    keywords: ['deploy', 'container', 'server', 'cloud', 'pipeline', 'build', 'infrastructure']
  },
  network: {
    name: 'Network & Security',
    subcategories: ['wifi', 'ethernet', 'vpn', 'firewall', 'ssl', 'dns', 'routing'],
    keywords: ['connection', 'timeout', 'refused', 'network', 'ip', 'port', 'socket', 'certificate']
  },
  
  // === DEVICES & HARDWARE ===
  computer: {
    name: 'Computer & Laptop',
    subcategories: ['windows', 'macos', 'linux', 'bios', 'drivers', 'hardware'],
    keywords: ['pc', 'laptop', 'desktop', 'boot', 'startup', 'shutdown', 'freeze', 'crash', 'bsod']
  },
  smartphone: {
    name: 'Smartphone & Tablet',
    subcategories: ['iphone', 'android', 'samsung', 'pixel', 'ipad'],
    keywords: ['phone', 'mobile', 'screen', 'battery', 'charging', 'sim', 'update']
  },
  printer: {
    name: 'Printer & Scanner',
    subcategories: ['hp', 'canon', 'epson', 'brother', 'inkjet', 'laser'],
    keywords: ['print', 'scan', 'paper', 'ink', 'toner', 'jam', 'offline', 'driver']
  },
  smart_home: {
    name: 'Smart Home & IoT',
    subcategories: ['alexa', 'google-home', 'smart-tv', 'thermostat', 'camera', 'doorbell'],
    keywords: ['smart', 'iot', 'connected', 'voice', 'automation', 'hub']
  },
  
  // === VEHICLES & AUTOMOTIVE ===
  automotive: {
    name: 'Automotive & Vehicles',
    subcategories: ['car', 'motorcycle', 'truck', 'electric-vehicle', 'maintenance'],
    keywords: ['engine', 'brake', 'oil', 'tire', 'battery', 'warning', 'check', 'diagnostic']
  },
  
  // === HOME & APPLIANCES ===
  appliances: {
    name: 'Home Appliances',
    subcategories: ['washer', 'dryer', 'refrigerator', 'dishwasher', 'oven', 'microwave', 'ac', 'heater'],
    keywords: ['appliance', 'not working', 'error code', 'beeping', 'leaking', 'not heating', 'not cooling']
  },
  plumbing: {
    name: 'Plumbing',
    subcategories: ['toilet', 'sink', 'shower', 'water-heater', 'pipes', 'drain'],
    keywords: ['leak', 'clog', 'drain', 'water', 'pressure', 'pipe', 'faucet']
  },
  electrical: {
    name: 'Electrical',
    subcategories: ['wiring', 'outlet', 'circuit-breaker', 'lighting', 'switch'],
    keywords: ['power', 'electric', 'outlet', 'circuit', 'breaker', 'tripped', 'voltage']
  },
  
  // === FINANCE & BANKING ===
  banking: {
    name: 'Banking & Finance',
    subcategories: ['credit-card', 'debit-card', 'online-banking', 'mobile-banking', 'loans', 'mortgage'],
    keywords: ['bank', 'account', 'transaction', 'payment', 'transfer', 'declined', 'blocked']
  },
  payment: {
    name: 'Payments & Checkout',
    subcategories: ['paypal', 'stripe', 'razorpay', 'upi', 'wallet', 'crypto'],
    keywords: ['payment', 'checkout', 'pay', 'card', 'declined', 'failed', 'refund']
  },
  
  // === GAMING & ENTERTAINMENT ===
  gaming: {
    name: 'Gaming',
    subcategories: ['pc-gaming', 'console', 'playstation', 'xbox', 'nintendo', 'mobile-gaming', 'steam'],
    keywords: ['game', 'gaming', 'fps', 'lag', 'crash', 'controller', 'graphics']
  },
  streaming: {
    name: 'Streaming & Media',
    subcategories: ['netflix', 'youtube', 'spotify', 'disney-plus', 'amazon-prime', 'twitch'],
    keywords: ['stream', 'video', 'audio', 'buffer', 'playback', 'quality', 'subtitle']
  },
  
  // === SOFTWARE & APPS ===
  software: {
    name: 'Software & Applications',
    subcategories: ['microsoft-office', 'adobe', 'antivirus', 'browser', 'email-client'],
    keywords: ['software', 'app', 'application', 'install', 'update', 'license', 'crash']
  },
  authentication: {
    name: 'Authentication & Login',
    subcategories: ['password', 'two-factor', 'oauth', 'sso', 'mfa'],
    keywords: ['login', 'password', 'authentication', 'token', 'session', 'locked', 'reset']
  },
  
  // === SOCIAL & COMMUNICATION ===
  social_media: {
    name: 'Social Media',
    subcategories: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'whatsapp'],
    keywords: ['social', 'account', 'post', 'message', 'blocked', 'suspended', 'verification']
  },
  email: {
    name: 'Email',
    subcategories: ['gmail', 'outlook', 'yahoo', 'smtp', 'imap'],
    keywords: ['email', 'mail', 'inbox', 'spam', 'send', 'receive', 'attachment']
  },
  
  // === GENERAL CATEGORIES ===
  general: {
    name: 'General',
    subcategories: ['troubleshooting', 'how-to', 'tips', 'best-practices'],
    keywords: []
  },
  other: {
    name: 'Other',
    subcategories: [],
    keywords: []
  }
};

/**
 * Smart category detection from error message and context
 */
function detectSmartCategory(errorMessage, context = {}) {
  const text = (errorMessage + ' ' + JSON.stringify(context)).toLowerCase();
  
  let bestMatch = { category: 'general', subcategory: null, score: 0 };
  
  for (const [categoryKey, categoryData] of Object.entries(SMART_CATEGORIES)) {
    let score = 0;
    let matchedSubcategory = null;
    
    // Check keywords
    for (const keyword of categoryData.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    
    // Check subcategories (higher weight)
    for (const sub of categoryData.subcategories) {
      if (text.includes(sub.toLowerCase())) {
        score += 3;
        matchedSubcategory = sub;
      }
    }
    
    if (score > bestMatch.score) {
      bestMatch = {
        category: categoryKey,
        subcategory: matchedSubcategory,
        score
      };
    }
  }
  
  return bestMatch;
}

/**
 * Map detected category to valid category
 */
function mapCategory(category) {
  // If it's already a valid smart category, return it
  if (SMART_CATEGORIES[category]) {
    return category;
  }
  
  // Legacy mapping
  const legacyMapping = {
    'payment': 'payment',
    'website': 'web_development',
    'gaming': 'gaming',
    'mobile': 'smartphone',
    'software': 'software',
    'network': 'network',
    'database': 'database',
    'authentication': 'authentication',
    'api': 'web_development'
  };
  
  return legacyMapping[category] || 'general';
}

/**
 * Extract common causes from multiple AI responses
 */
function extractCommonCauses(aiResponses) {
  const causes = new Set();
  
  aiResponses.forEach(response => {
    // Extract causes from explanation
    const explanation = response.explanation || '';
    const causePatterns = [
      /(?:caused by|because of|due to)\s+([^.]+)/gi,
      /(?:common cause|typical cause)[s]?\s*:?\s*([^.]+)/gi
    ];
    
    causePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(explanation)) !== null) {
        causes.add(match[1].trim());
      }
    });
  });
  
  return Array.from(causes).slice(0, 5);
}

/**
 * Generate tags from error context
 */
function generateTags(tracker) {
  const tags = new Set();
  
  if (tracker.language) tags.add(tracker.language);
  if (tracker.errorType) tags.add(tracker.errorType);
  if (tracker.category) tags.add(tracker.category);
  
  // Extract keywords from error message
  const keywords = tracker.originalError
    .toLowerCase()
    .match(/\b(error|exception|failed|undefined|null|missing|invalid|timeout|connection|auth|permission)\b/g);
  
  if (keywords) {
    keywords.forEach(kw => tags.add(kw));
  }
  
  return Array.from(tags);
}

/**
 * Determine difficulty level
 */
function determineDifficulty(tracker) {
  const avgConfidence = tracker.aiResponses.reduce((sum, r) => sum + r.confidence, 0) / tracker.aiResponses.length;
  
  if (avgConfidence >= 0.9) return 'easy';
  if (avgConfidence >= 0.7) return 'medium';
  return 'hard';
}

// ============================================================================
// QUEUE PROCESSING
// ============================================================================

/**
 * Process queued error patterns for verification
 */
async function processVerificationQueue() {
  console.log('🔄 Processing verification queue...');
  
  let processed = 0;
  let verified = 0;
  
  for (const [patternKey, tracker] of errorPatternTracker.entries()) {
    if (tracker.verificationStatus !== 'queued') continue;
    
    processed++;
    
    // Verify from internet sources
    const verification = await verifyFromInternetSources(tracker);
    
    if (verification.verified) {
      await addToLibrary(tracker, 'internet-verified');
      verified++;
    } else {
      // Check if it has enough helpful votes
      if (tracker.helpfulVotes >= CONFIG.MIN_HELPFUL_VOTES) {
        await addToLibrary(tracker, 'user-verified');
        verified++;
      } else {
        tracker.verificationStatus = 'pending'; // Re-queue
      }
    }
    
    // Rate limit API calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`✅ Queue processed: ${processed} checked, ${verified} added to library`);
  
  return { processed, verified };
}

/**
 * Get learning statistics
 */
function getLearningStats() {
  const stats = {
    totalPatterns: errorPatternTracker.size,
    byStatus: {
      pending: 0,
      queued: 0,
      verified: 0,
      rejected: 0,
      exists: 0,
      failed: 0
    },
    topPatterns: [],
    recentAdditions: []
  };
  
  for (const [key, tracker] of errorPatternTracker.entries()) {
    stats.byStatus[tracker.verificationStatus] = (stats.byStatus[tracker.verificationStatus] || 0) + 1;
    
    stats.topPatterns.push({
      pattern: key.substring(0, 80),
      occurrences: tracker.occurrences,
      score: tracker.verificationScore,
      status: tracker.verificationStatus
    });
  }
  
  // Sort by occurrences
  stats.topPatterns.sort((a, b) => b.occurrences - a.occurrences);
  stats.topPatterns = stats.topPatterns.slice(0, 20);
  
  return stats;
}

/**
 * Clear old patterns from memory
 */
function cleanupOldPatterns(maxAgeDays = 30) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  let cleaned = 0;
  
  for (const [key, tracker] of errorPatternTracker.entries()) {
    if (tracker.lastSeen < cutoff && tracker.verificationStatus !== 'verified') {
      errorPatternTracker.delete(key);
      cleaned++;
    }
  }
  
  console.log(`🧹 Cleaned ${cleaned} old patterns from memory`);
  return cleaned;
}

// ============================================================================
// IMMEDIATE LEARNING - Scrape and Store on Every Query
// ============================================================================

/**
 * Immediately scrape web sources and store solution in library
 * Called during AI analysis for instant learning
 * 
 * @param {Object} params - Error and solution data
 * @returns {Object} - Scraped sources and library entry status
 */
async function learnAndStoreImmediately(params) {
  const {
    errorMessage,
    errorType,
    language,
    category,
    aiResponse,
    userId
  } = params;
  
  const startTime = Date.now();
  const results = {
    sources: [],
    libraryEntry: null,
    scrapedSolutions: [],
    success: false
  };
  
  try {
    console.log(`🔍 [LibraryLearning] Starting immediate learning for: ${errorMessage.substring(0, 50)}...`);
    
    // Step 1: Detect product/category from error
    const detectedProducts = detectProductFromError(errorMessage, {
      language,
      category
    });
    
    // Step 2: Scrape relevant forums in parallel (with limit)
    const scrapePromises = [];
    const maxConcurrentScrapes = 3;
    
    for (const productInfo of detectedProducts.slice(0, maxConcurrentScrapes)) {
      scrapePromises.push(
        searchProductForums(errorMessage, productInfo)
          .catch(err => {
            console.warn(`Forum scrape failed for ${productInfo.vendor}:`, err.message);
            return [];
          })
      );
    }
    
    // Also search Stack Overflow for programming errors
    if (language && ['javascript', 'python', 'java', 'typescript', 'csharp', 'cpp', 'go', 'rust', 'php', 'ruby'].includes(language.toLowerCase())) {
      scrapePromises.push(
        searchStackExchange(extractSearchTerms(errorMessage), 'stackoverflow.com')
          .catch(err => {
            console.warn('Stack Overflow search failed:', err.message);
            return [];
          })
      );
    }
    
    // Wait for all scrapes to complete
    const allResults = await Promise.all(scrapePromises);
    
    // Flatten and collect sources
    for (const forumResults of allResults) {
      if (Array.isArray(forumResults)) {
        for (const result of forumResults) {
          if (result.results && result.results.length > 0) {
            results.sources.push({
              forum: result.forum,
              vendor: result.vendor,
              product: result.product,
              topSolution: result.topResult,
              allResults: result.results.slice(0, 3)
            });
            
            // Extract actual solutions from forum results
            for (const forumPost of result.results.slice(0, 2)) {
              if (!forumPost.isSearchLink) {
                results.scrapedSolutions.push({
                  title: forumPost.title,
                  url: forumPost.link,
                  source: forumPost.source,
                  score: forumPost.score || 0,
                  isAnswered: forumPost.isAnswered
                });
              }
            }
          } else if (result.title && result.link) {
            // Direct result from Stack Exchange
            results.scrapedSolutions.push({
              title: result.title,
              url: result.link,
              source: result.source || 'stackoverflow',
              score: result.score || 0,
              isAnswered: result.isAnswered
            });
          }
        }
      }
    }
    
    console.log(`📚 [LibraryLearning] Found ${results.sources.length} sources, ${results.scrapedSolutions.length} solutions`);
    
    // Step 3: Store in library if we have good AI response + web verification
    if (aiResponse && aiResponse.confidence >= 0.7 && results.scrapedSolutions.length > 0) {
      const topWebSolution = results.scrapedSolutions[0];
      
      // Check if this error pattern already exists
      const pattern = normalizeErrorPattern(errorMessage, errorType, language);
      const existingEntry = await ErrorLibrary.findOne({
        where: {
          errorPattern: pattern,
          type: 'system',
          isActive: true
        }
      });
      
      if (existingEntry) {
        // Update existing entry with new source
        await existingEntry.update({
          viewCount: existingEntry.viewCount + 1,
          lastVerified: new Date(),
          sourceUrl: existingEntry.sourceUrl || topWebSolution.url
        });
        results.libraryEntry = { updated: true, id: existingEntry.id };
        console.log(`📖 [LibraryLearning] Updated existing entry: ${existingEntry.id}`);
      } else {
        // Smart category detection
        const smartCat = detectSmartCategory(errorMessage, { language, errorType, category });
        console.log(`🏷️ [LibraryLearning] Detected category: ${smartCat.category} / ${smartCat.subcategory}`);
        
        // Create new library entry with smart categorization
        const entry = await ErrorLibrary.create({
          type: 'system',
          errorCode: generateErrorCode({ pattern, language }),
          errorPattern: pattern,
          title: generateTitle(errorMessage, errorType),
          errorMessage: errorMessage.substring(0, 500),
          category: smartCat.category,
          subcategory: smartCat.subcategory || language || null,
          explanation: aiResponse.explanation,
          solution: aiResponse.solution,
          codeExample: aiResponse.codeExample || null,
          tags: generateTags({ language, errorType, category: smartCat.category, originalError: errorMessage }),
          difficulty: 'medium',
          sourceUrl: topWebSolution.url,
          webSources: JSON.stringify(results.scrapedSolutions.slice(0, 5)),
          lastVerified: new Date(),
          isPublic: true,
          isActive: true,
          viewCount: 1,
          helpfulCount: 0
        });
        
        results.libraryEntry = { created: true, id: entry.id, title: entry.title, category: smartCat.category };
        console.log(`✅ [LibraryLearning] Created new entry: ${entry.id} - ${entry.title} (${smartCat.category})`);
      }
    }
    
    results.success = true;
    results.processingTimeMs = Date.now() - startTime;
    
    console.log(`🎓 [LibraryLearning] Completed in ${results.processingTimeMs}ms`);
    
  } catch (error) {
    console.error('❌ [LibraryLearning] Immediate learning failed:', error.message);
    results.error = error.message;
  }
  
  return results;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Start periodic queue processing
let queueProcessorInterval = null;

function startLearningService() {
  console.log('🎓 Library Learning Service started');
  
  // Process queue periodically
  queueProcessorInterval = setInterval(() => {
    processVerificationQueue().catch(err => 
      console.error('Queue processing error:', err.message)
    );
  }, CONFIG.QUEUE_CHECK_INTERVAL_MS);
  
  // Cleanup old patterns daily
  setInterval(() => {
    cleanupOldPatterns(30);
  }, 24 * 60 * 60 * 1000);
}

function stopLearningService() {
  if (queueProcessorInterval) {
    clearInterval(queueProcessorInterval);
    queueProcessorInterval = null;
  }
  console.log('🛑 Library Learning Service stopped');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core functions
  trackError,
  checkEligibilityForLibrary,
  verifyFromInternetSources,
  addToLibrary,
  
  // Immediate learning - scrape and store on every query
  learnAndStoreImmediately,
  
  // Smart categorization
  detectSmartCategory,
  SMART_CATEGORIES,
  
  // Product detection
  detectProductFromError,
  searchProductForums,
  
  // User-specific solutions
  saveUserSolution,
  getUserSolutions,
  getCombinedLibrary,
  deleteUserSolution,
  
  // Queue management
  processVerificationQueue,
  
  // Statistics
  getLearningStats,
  cleanupOldPatterns,
  
  // Service lifecycle
  startLearningService,
  stopLearningService,
  
  // Configuration
  CONFIG,
  FORUM_SOURCES
};
