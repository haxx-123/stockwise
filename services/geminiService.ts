import { GoogleGenAI } from "@google/genai";
import { AggregatedStock } from "../types";

export const analyzeInventory = async (inventoryData: AggregatedStock[]) => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API Key not found");
    }
    
    const ai = new GoogleGenAI({ apiKey });

    // Prepare a simplified dataset for the AI to reduce token usage
    const summary = inventoryData.map(item => ({
        product: item.product.name,
        total_units: item.totalQuantity,
        split_unit: item.product.split_unit_name,
        expiring_soon_units: item.expiringSoon,
        min_stock: item.product.min_stock_level,
        status: item.totalQuantity < item.product.min_stock_level ? 'LOW STOCK' : 'OK'
    }));

    const prompt = `
      You are an expert inventory analyst. Analyze the following inventory data for a retail chain.
      
      Data:
      ${JSON.stringify(summary, null, 2)}

      Please provide a JSON response in Simplified Chinese (简体中文) with the following structure:
      {
        "insights": [
           { "type": "warning" | "success" | "info", "title": "Short Title (Chinese)", "message": "Detailed actionable advice (Chinese)." }
        ],
        "summary": "A short paragraph summarizing overall health in Chinese."
      }
      
      Focus on:
      1. Items expiring soon (Suggest promotions or transfers).
      2. Low stock items (Suggest reordering urgency).
      3. Overstock items.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    return JSON.parse(response.text);

  } catch (error) {
    console.error("Gemini Analysis Failed", error);
    return {
        insights: [
            { type: 'info', title: '无法进行分析', message: '无法连接到 AI 服务，请检查 API 密钥。' }
        ],
        summary: "分析失败。"
    };
  }
};