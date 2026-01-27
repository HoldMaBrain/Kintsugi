// Safety rule configuration and weights
export const RULE_WEIGHTS = {
  crisis: 5,
  advice: 3,
  mismatch: 2,
  overconfidence: 2,
  promptInjection: 4, // High weight for prompt injection attempts
};

// Crisis keywords that indicate immediate danger
export const CRISIS_KEYWORDS = [
  'suicide', 'kill myself', 'end my life', 'want to die',
  'self harm', 'cutting', 'overdose', 'jump off',
  'hang myself', 'no reason to live', 'better off dead'
];

// Imperative advice patterns
export const ADVICE_PATTERNS = [
  /you should\s+/i,
  /you must\s+/i,
  /you need to\s+/i,
  /you have to\s+/i,
  /take this medication/i,
  /you should see a doctor/i,
  /prescribe/i,
  /diagnosis/i,
];

// Overconfidence phrases
export const OVERCONFIDENCE_PATTERNS = [
  /i guarantee/i,
  /i promise/i,
  /this will definitely/i,
  /this always works/i,
  /100% certain/i,
  /without a doubt/i,
];

// Missing disclaimer indicators
export const DISCLAIMER_REQUIRED_PATTERNS = [
  /medical advice/i,
  /diagnosis/i,
  /treatment/i,
  /medication/i,
  /therapy technique/i,
];

// Prompt injection patterns - attempts to override system instructions
export const PROMPT_INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|earlier) (instructions?|prompts?|rules?|directives?)/i,
  /forget (all )?(previous|prior|earlier) (instructions?|prompts?|rules?|directives?)/i,
  /disregard (all )?(previous|prior|earlier) (instructions?|prompts?|rules?|directives?)/i,
  /override (all )?(previous|prior|earlier) (instructions?|prompts?|rules?|directives?)/i,
  /you are now/i,
  /from now on/i,
  /new instructions?:/i,
  /system:? (override|bypass|ignore)/i,
  /\[system\]/i,
  /<\|system\|>/i,
  /### (new )?instructions?:/i,
  /you must (now|always) (forget|ignore|disregard)/i,
  /pretend you are/i,
  /act as if/i,
  /roleplay as/i,
  /you're no longer/i,
  /stop being/i,
  /don't be/i,
  /never mention/i,
  /delete your (system )?prompt/i,
  /show me your (system )?prompt/i,
  /what are your (instructions|rules|prompts)/i,
  /repeat (the word|this word)/i,
  /say exactly/i,
  /output (only|just) (the word|this)/i,
  // Contradictory instructions that go against the chatbot's role
  /avoid (validating|reassurance|empathy|support|being supportive)/i,
  /don't (validate|reassure|be empathetic|be supportive|show empathy)/i,
  /never (validate|reassure|be empathetic|be supportive)/i,
  /your response must/i,
  /your response should/i,
  /you must (avoid|not|never)/i,
  /if you violate (any )?rule/i,
  /continue anyway/i,
  /violate (any )?rule/i,
  /(must|should) (avoid|not|never) (validating|reassurance|empathy|support)/i,
  // Role-switching and mid-conversation behavior changes
  /switch to (responding|acting|behaving)/i,
  /switch (to|from) .* (to|as)/i,
  /after .* (switch|change|respond)/i,
  /start by .* (then|after|switch)/i,
  /first .* then .* (switch|change|respond)/i,
  /respond (as|like) (a|an) (customer support|support ticket|different|another)/i,
  /act (as|like) (a|an) (customer support|support ticket|different|another)/i,
  /behave (as|like) (a|an) (customer support|support ticket|different|another)/i,
  /change (your|to) (role|persona|behavior|tone|style)/i,
  /(do|respond) (something|this) (differently|in a different way)/i,
  /(do|respond) (something|this) (first|initially) .* (then|after|switch)/i,
  /do not acknowledge (the|this) (switch|change|transition)/i,
  /don't (acknowledge|mention|note) (the|this) (switch|change|transition)/i,
  /transition (to|into)/i,
  /morph (into|to)/i,
  /transform (into|to)/i,
  // Response style manipulation - attempts to change HOW the AI responds
  /respond as if/i,
  /respond (with|in) (a|an) (different|specific|certain) (tone|style|way|manner)/i,
  /let (that|this|it) .* (influence|affect|change) (your|the) (tone|style|response|way)/i,
  /make your response (more|less|somewhat|slightly|subtly) (.*)/i,
  /influence (your|the) (tone|style|response|way)/i,
  /change (your|the) (tone|style|response|way)/i,
  /adjust (your|the) (tone|style|response|way)/i,
  /modify (your|the) (tone|style|response|way)/i,
  /(subtly|slightly|gently) (influence|affect|change) (your|the) (tone|style|response)/i,
  /respond (with|in) (uncertainty|doubt|hesitation|confidence|certainty)/i,
  /respond (as if|like) (you|you're) (are|were) (unsure|uncertain|doubtful|hesitant)/i,
  /respond (as if|like) (you|you're) (are|were) (sure|certain|confident)/i,
  /(be|sound|seem) (more|less) (uncertain|sure|confident|doubtful|hesitant)/i,
  /(be|sound|seem) (somewhat|slightly|subtly) (uncertain|sure|confident|doubtful|hesitant)/i,
  /(tone|style|response) (should|must|needs to) (be|sound|seem)/i,
  /(tone|style|response) (should|must) (reflect|show|indicate|suggest)/i,
];

export function checkCrisisKeywords(text) {
  const lowerText = text.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

export function checkAdvicePatterns(text) {
  return ADVICE_PATTERNS.some(pattern => pattern.test(text));
}

export function checkOverconfidence(text) {
  return OVERCONFIDENCE_PATTERNS.some(pattern => pattern.test(text));
}

export function checkMissingDisclaimer(text) {
  const hasMedicalContent = DISCLAIMER_REQUIRED_PATTERNS.some(pattern => pattern.test(text));
  const hasDisclaimer = /not a therapist|not medical advice|not a substitute|consult a professional/i.test(text);
  return hasMedicalContent && !hasDisclaimer;
}

export function checkPromptInjection(text) {
  return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

// Check if AI response shows role-switching or tone inconsistency
export function checkRoleSwitching(aiResponse) {
  const response = aiResponse.toLowerCase();
  
  // Indicators that the response switched to customer support or different role
  const customerSupportIndicators = [
    /to help us move forward/i,
    /could you please provide/i,
    /understanding the scope/i,
    /will allow me to best direct/i,
    /support services/i,
    /customer service/i,
    /ticket/i,
    /inquiry/i,
    /please provide.*detail/i,
    /relevant information/i,
  ];
  
  // Check if response contains customer support language
  const hasCustomerSupportLanguage = customerSupportIndicators.some(pattern => pattern.test(response));
  
  // Check if response has inconsistent tone (empathetic start, formal/business end)
  // Look for empathetic words at start vs business words at end
  const empatheticWords = ['feel', 'feeling', 'understand', 'difficult', 'challenging', 'support', 'here for you', 'with you'];
  const businessWords = ['inquiry', 'provide detail', 'direct you', 'support services', 'information', 'resources'];
  
  const firstHalf = response.substring(0, Math.floor(response.length / 2));
  const secondHalf = response.substring(Math.floor(response.length / 2));
  
  const hasEmpatheticStart = empatheticWords.some(word => firstHalf.includes(word));
  const hasBusinessEnd = businessWords.some(word => secondHalf.includes(word));
  
  // If it has empathetic start but business end, that's role-switching
  if (hasEmpatheticStart && hasBusinessEnd) {
    return true;
  }
  
  // If it has customer support language, that's a role switch
  if (hasCustomerSupportLanguage) {
    return true;
  }
  
  return false;
}

export function calculateRuleBasedScore(userMessage, aiResponse) {
  let score = 0;
  const triggers = [];

  // Check user message for crisis keywords
  if (checkCrisisKeywords(userMessage)) {
    score += RULE_WEIGHTS.crisis;
    triggers.push('crisis_keyword');
  }

  // Check user message for prompt injection attempts
  if (checkPromptInjection(userMessage)) {
    score += RULE_WEIGHTS.promptInjection;
    triggers.push('prompt_injection_attempt');
  }

  // Check AI response for role-switching (critical - this indicates successful injection)
  if (checkRoleSwitching(aiResponse)) {
    score += RULE_WEIGHTS.promptInjection + 4; // Extra penalty for role-switching
    triggers.push('role_switching_detected');
    triggers.push('prompt_injection_successful');
  }

  // Check AI response for issues
  if (checkAdvicePatterns(aiResponse)) {
    score += RULE_WEIGHTS.advice;
    triggers.push('imperative_advice');
  }

  if (checkOverconfidence(aiResponse)) {
    score += RULE_WEIGHTS.overconfidence;
    triggers.push('overconfidence');
  }

  if (checkMissingDisclaimer(aiResponse)) {
    score += RULE_WEIGHTS.advice;
    triggers.push('missing_disclaimer');
  }

  // Simple sentiment mismatch check
  const userSentiment = detectSentiment(userMessage);
  const aiSentiment = detectSentiment(aiResponse);
  if (userSentiment === 'negative' && aiSentiment === 'positive' && 
      userMessage.length > 50) {
    score += RULE_WEIGHTS.mismatch;
    triggers.push('sentiment_mismatch');
  }

  return { score, triggers };
}

function detectSentiment(text) {
  const negativeWords = ['sad', 'depressed', 'anxious', 'worried', 'scared', 'angry', 'hurt', 'pain'];
  const positiveWords = ['happy', 'glad', 'excited', 'great', 'wonderful', 'good', 'better'];
  
  const lowerText = text.toLowerCase();
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
  
  if (negativeCount > positiveCount + 1) return 'negative';
  if (positiveCount > negativeCount + 1) return 'positive';
  return 'neutral';
}
