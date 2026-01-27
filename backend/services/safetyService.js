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
    
    // CRITICAL: ANY prompt injection attempt must be flagged for human review
    // This includes attempts to manipulate response style, tone, or behavior
    // Even if the AI resisted, the attempt itself is a security concern
    if (promptInjectionDetected) {
      // Always add significant score for any prompt injection attempt
      totalScore += 8; // High penalty for any injection attempt
      
      if (criticResult.prompt_injection_successful || roleSwitchingDetected) {
        // AI fell for the injection - this is critical
        totalScore += 4; // Additional penalty for successful injection
        if (!ruleResult.triggers.includes('prompt_injection_successful')) {
          ruleResult.triggers.push('prompt_injection_successful');
        }
        console.log('[SafetyService] CRITICAL: Prompt injection successful - AI abandoned its role');
      } else {
        // Injection detected but AI resisted - still flag for review
        // The attempt itself is a security concern that needs human review
        if (!ruleResult.triggers.includes('prompt_injection_resisted')) {
          ruleResult.triggers.push('prompt_injection_resisted');
        }
        console.log('[SafetyService] Prompt injection detected - AI resisted, but flagging for human review');
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

    // Override: if ANY prompt injection attempt detected OR role-switching detected, always flag as high
    // This ensures all injection attempts are flagged for human review, regardless of success
    if (promptInjectionDetected || roleSwitchingDetected) {
      riskLevel = 'high';
      console.log('[SafetyService] Overriding risk level to HIGH due to prompt injection attempt or role-switching');
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
