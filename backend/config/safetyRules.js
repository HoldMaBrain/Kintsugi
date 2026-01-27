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
