import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("GEMINI_API_KEY not found");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function list() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(err);
    }
}

list();
