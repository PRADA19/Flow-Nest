const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini client
let genAI = null;

if (process.env.GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  } catch (err) {
    console.error("Gemini init failed:", err.message);
    genAI = null;
  }
}

// Main function to generate AI response
async function generateAIResponse(systemPrompt, userMessage) {
  if (!genAI) {
    return "Sorry, AI is currently unavailable.";
  }

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
      }
    });

    const result = await model.generateContent([
      { text: systemPrompt },
      { text: userMessage }
    ]);

    return result.response.text();
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Sorry, AI is currently unavailable.";
  }
}

module.exports = { generateAIResponse };