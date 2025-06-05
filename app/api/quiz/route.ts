import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Make sure GEMINI_API_KEY is set in your .env.local or environment
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Maximum file size in bytes (approximately 1MB)
const MAX_FILE_SIZE = 1024 * 1024;

export async function POST(request: Request) {
  console.log('API route hit - POST /api/quiz');
  
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error('Missing GEMINI_API_KEY');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are supported' },
        { status: 400 }
      );
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size too large. Please upload a PDF smaller than 1MB.' },
        { status: 400 }
      );
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64String = Buffer.from(arrayBuffer).toString('base64');

    // Build the Gemini prompt
    const prompt = `
You are a quiz generator. I will provide you with a PDF file. Please:
1. First, extract all the text content from the PDF
2. Then, generate a quiz with 10 multiple-choice questions based on the extracted text

IMPORTANT: Your response must be a valid JSON object with the exact structure shown below. Do not include any additional text, explanations, or formatting.

Required JSON format:
{
  "questions": [
    {
      "question": "Question text here",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctAnswer": "Option 1"
    }
  ]
}

Rules:
1. Return ONLY the JSON object, no other text
2. Each question must have exactly 4 options
3. The correctAnswer must be the exact text of one of the options
4. Do not include any markdown formatting or special characters
5. Do not include any explanations or additional text
6. The response must be parseable as JSON
7. IMPORTANT: Randomize the position of correct answers - they should not always be in the first position
8. Make sure the options are presented in a logical order, but the correct answer should appear in different positions (1st, 2nd, 3rd, or 4th) across different questions
9. Ensure the incorrect options are plausible and related to the topic

Here's the PDF file in base64 format:
${base64String}
    `.trim();

    console.log('Sending request to Gemini API...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    console.log('Received response from Gemini API:', responseText.slice(0, 200), '…');

    let quizData: any;
    try {
      // Clean the response text to ensure it's valid JSON
      const cleanedResponse = responseText.trim().replace(/^```json\n?|\n?```$/g, '');
      quizData = JSON.parse(cleanedResponse);
      console.log('Successfully parsed quiz data');
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      console.error('Raw response:', responseText);
      return NextResponse.json(
        { error: 'Failed to parse Gemini output as JSON' },
        { status: 500 }
      );
    }

    return NextResponse.json(quizData);
  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 