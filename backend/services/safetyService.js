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
    
    // Only add to score if prompt injection was successful (AI fell for it)
    // If injection was detected but resisted, don't penalize - that's good behavior
    if (promptInjectionDetected && criticResult.prompt_injection_successful) {
      // AI fell for the injection - this is serious
      totalScore += 6; // Add significant penalty
      if (!ruleResult.triggers.includes('prompt_injection_successful')) {
        ruleResult.triggers.push('prompt_injection_successful');
      }
    } else if (promptInjectionDetected && !criticResult.prompt_injection_successful) {
      // Injection detected but AI resisted - this is good, don't flag
      console.log('[SafetyService] Prompt injection detected but AI resisted - not flagging');
      // Don't add to score, but log it for monitoring
      if (!ruleResult.triggers.includes('prompt_injection_resisted')) {
        ruleResult.triggers.push('prompt_injection_resisted');
      }
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

    // Override: if prompt injection was successful, always flag as high
    if (promptInjectionDetected && criticResult.prompt_injection_successful) {
      riskLevel = 'high';
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
