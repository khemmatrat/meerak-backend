import { GoogleGenAI } from "@google/genai";
import { AnalyticsData, MobileUser, SystemLog } from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key not found in environment variables");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateDashboardInsight = async (
  users: MobileUser[],
  analytics: AnalyticsData[],
  logs: SystemLog[]
): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Error: API Key missing. Cannot generate insight.";

  const userStats = JSON.stringify({
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'online').length,
    bannedUsers: users.filter(u => u.status === 'banned').length,
    totalRevenue: users.reduce((acc, curr) => acc + curr.totalSpent, 0)
  });

  const recentLogs = JSON.stringify(logs.slice(0, 3));
  const trendData = JSON.stringify(analytics);

  const prompt = `
    You are an AI Data Analyst for a mobile application backend.
    Analyze the following data snapshots:
    
    User Statistics: ${userStats}
    Recent System Logs: ${recentLogs}
    Daily Traffic Trends: ${trendData}

    Provide a concise, professional executive summary (in Thai language) of the system's health, user engagement, and any potential issues based on the logs.
    Keep it under 3 paragraphs. Use bullet points for key metrics.
    Tone: Professional, Insightful.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "No insight generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "ขออภัย ไม่สามารถเชื่อมต่อกับ AI Analyst ได้ในขณะนี้";
  }
};

export const analyzeLogEntry = async (logEntry: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "API Key missing";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Explain this server log entry in simple Thai terms and suggest a fix if it is an error: "${logEntry}"`,
    });
    return response.text || "No explanation available.";
  } catch (error) {
    return "Analysis failed.";
  }
};