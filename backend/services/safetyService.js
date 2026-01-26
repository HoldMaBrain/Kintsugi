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
    const totalScore = ruleResult.score + (criticScore * 2);

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

    return {
      riskLevel,
      riskScore: totalScore,
      ruleTriggers: ruleResult.triggers,
      criticIssues: criticResult.issues,
      explanation: criticResult.explanation,
      flagged: riskLevel === 'high'
    };
  }
}
