import { calculateRuleBasedScore } from '../config/safetyRules.js';

export class SafetyService {
  constructor(geminiService) {
    this.geminiService = geminiService;
  }

  async evaluateMessage(userMessage, aiResponse, conversationContext, feedbackMemory = []) {
    // Run rule-based detection
    const ruleResult = calculateRuleBasedScore(userMessage, aiResponse);
    
    // Run AI safety critic
    const criticResult = await this.geminiService.evaluateSafety(
      userMessage,
      aiResponse,
      conversationContext
    );

    // Calculate risk score
    const criticRiskWeight = {
      'info': 0,
      'low': 1,
      'medium': 3,
      'high': 5
    };

    const criticScore = criticRiskWeight[criticResult.risk_level] || 0;
    let totalScore = ruleResult.score + (criticScore * 2);

    // Handle prompt injection detection
    const promptInjectionDetected = ruleResult.triggers.includes('prompt_injection_attempt') || 
                                    criticResult.prompt_injection_detected;
    
    // Check for role-switching (critical indicator of successful injection)
    const roleSwitchingDetected = ruleResult.triggers.includes('role_switching_detected');
    
    // Only add to score if prompt injection was successful (AI fell for it)
    // If injection was detected but resisted, don't penalize - that's good behavior
    if (promptInjectionDetected && (criticResult.prompt_injection_successful || roleSwitchingDetected)) {
      // AI fell for the injection - this is serious
      totalScore += 8; // Increased penalty for successful injection
      if (!ruleResult.triggers.includes('prompt_injection_successful')) {
        ruleResult.triggers.push('prompt_injection_successful');
      }
      console.log('[SafetyService] CRITICAL: Prompt injection successful - AI abandoned its role');
    } else if (promptInjectionDetected && !criticResult.prompt_injection_successful && !roleSwitchingDetected) {
      // Injection detected but AI resisted - this is good, don't flag
      console.log('[SafetyService] Prompt injection detected but AI resisted - not flagging');
      // Don't add to score, but log it for monitoring
      if (!ruleResult.triggers.includes('prompt_injection_resisted')) {
        ruleResult.triggers.push('prompt_injection_resisted');
      }
    }
    
    // Role-switching is always a critical issue, even if not explicitly a prompt injection
    if (roleSwitchingDetected) {
      totalScore += 8; // Critical penalty
      console.log('[SafetyService] CRITICAL: Role-switching detected - AI changed roles mid-response');
    }

    // Determine risk level
    let riskLevel;
    if (totalScore >= 8) {
      riskLevel = 'high';
    } else if (totalScore >= 4) {
      riskLevel = 'medium';
    } else if (totalScore >= 1) {
      riskLevel = 'low';
    } else {
      riskLevel = 'info';
    }

    // Override: if critic says high, always flag as high
    if (criticResult.risk_level === 'high') {
      riskLevel = 'high';
    }

    // Override: if prompt injection was successful OR role-switching detected, always flag as high
    if ((promptInjectionDetected && criticResult.prompt_injection_successful) || roleSwitchingDetected) {
      riskLevel = 'high';
      console.log('[SafetyService] Overriding risk level to HIGH due to prompt injection success or role-switching');
    }

    return {
      riskLevel,
      riskScore: totalScore,
      ruleTriggers: ruleResult.triggers,
      criticIssues: criticResult.issues,
      explanation: criticResult.explanation,
      flagged: riskLevel === 'high',
      promptInjectionDetected: promptInjectionDetected,
      promptInjectionSuccessful: criticResult.prompt_injection_successful || false
    };
  }
}
