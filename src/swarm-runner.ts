import { GoogleGenerativeAI, SchemaType, type Tool } from "@google/generative-ai";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { executeTool } from "./tools.js";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!API_KEY) {
    console.error("GEMINI_API_KEY not found in environment variables.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendMessageWithRetry(chat: any, message: any, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            return await chat.sendMessage(message);
        } catch (err: any) {
            if (err.status === 429 && i < retries - 1) {
                console.log(`   [Retry] Rate limited. Waiting 5s before attempt ${i + 2}/${retries}...`);
                await sleep(5000);
                continue;
            }
            throw err;
        }
    }
}

async function runProcurementSwarm() {
    console.log(`🚀 Starting ERP Agentic Swarm using ${MODEL_NAME}...`);

    const PERSONAS_PATH = path.join(process.cwd(), "../headless-erp-core/PERSONAS.md");
    if (!fs.existsSync(PERSONAS_PATH)) {
        console.error(`Personas file not found at ${PERSONAS_PATH}`);
        process.exit(1);
    }
    const personasContent = fs.readFileSync(PERSONAS_PATH, "utf-8");

    const officerParts = personasContent.split("## 1. Procurement Officer (The Worker)");
    const managerParts = personasContent.split("## 2. Finance Manager (The Approver)");
    if (officerParts.length < 2 || managerParts.length < 2) {
        console.error("Could not parse PERSONAS.md. Ensure proper headers exist.");
        process.exit(1);
    }

    const procurementOfficerPrompt = officerParts[1].split("## 2. Finance Manager (The Approver)")[0].trim();
    const financeManagerPrompt = managerParts[1].split("## The \"Handoff\" Protocol")[0].trim();

    const erpTools: Tool[] = [{
        functionDeclarations: [
            {
                name: "check_low_stock",
                description: "Returns a list of products where current stock is at or below reorder level.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        agentName: { type: SchemaType.STRING, description: "Name of the agent calling the tool" }
                    },
                    required: ["agentName"]
                }
            },
            {
                name: "fetch_vendor_quotes",
                description: "Fetches prices for a SKU from different vendors from the database.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        agentName: { type: SchemaType.STRING, description: "Name of the agent calling the tool" },
                        sku: { type: SchemaType.STRING, description: "The product SKU" }
                    },
                    required: ["agentName", "sku"]
                }
            },
            {
                name: "draft_purchase_order",
                description: "Creates a new purchase order in PENDING_APPROVAL status.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        agentName: { type: SchemaType.STRING, description: "Name of the agent calling the tool" },
                        vendorId: { type: SchemaType.STRING, description: "The vendor name or ID" },
                        items: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    productId: { type: SchemaType.STRING },
                                    quantity: { type: SchemaType.NUMBER },
                                    price: { type: SchemaType.NUMBER }
                                },
                                required: ["productId", "quantity", "price"]
                            }
                        }
                    },
                    required: ["agentName", "vendorId", "items"]
                }
            },
            {
                name: "list_pending_approvals",
                description: "Returns all purchase orders that are in PENDING_APPROVAL status.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        agentName: { type: SchemaType.STRING, description: "Name of the agent calling the tool" }
                    },
                    required: ["agentName"]
                }
            },
            {
                name: "approve_po",
                description: "Updates a purchase order status to 'APPROVED'.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        agentName: { type: SchemaType.STRING, description: "Name of the agent calling the tool" },
                        poId: { type: SchemaType.STRING, description: "The ID of the purchase order" }
                    },
                    required: ["agentName", "poId"]
                }
            },
            {
                name: "reject_po",
                description: "Updates a purchase order status to 'REJECTED'.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        agentName: { type: SchemaType.STRING, description: "Name of the agent calling the tool" },
                        poId: { type: SchemaType.STRING, description: "The ID of the purchase order" }
                    },
                    required: ["agentName", "poId"]
                }
            }
        ]
    }];

    const model = genAI.getGenerativeModel({ model: MODEL_NAME, tools: erpTools });

    // OFFICER PHASE
    console.log("\n👷 Phase 1: Procurement Officer Analysis...");
    const officerChat = model.startChat({ history: [] });
    const officerInp = `SYSTEM: ${procurementOfficerPrompt}\nTASK: Perform a full procurement check. Identify low stock, get quotes, and draft POs. Use 'Procurement Officer' as your agentName.`;

    let response = await sendMessageWithRetry(officerChat, officerInp);

    while (response.response.functionCalls()?.length) {
        const toolResponses = [];
        for (const call of response.response.functionCalls()!) {
            console.log(`   [Officer] Tool: ${call.name}`);
            const result = await executeTool(call.name, call.args);
            toolResponses.push({ functionResponse: { name: call.name, response: { content: result } } });
        }
        response = await sendMessageWithRetry(officerChat, toolResponses);
    }
    console.log("\n✅ OFFICER SUMMARY:\n" + response.response.text());

    // MANAGER PHASE
    console.log("\n💼 Phase 2: Finance Manager Review...");
    const managerChat = model.startChat({ history: [] });
    const managerInp = `SYSTEM: ${financeManagerPrompt}\nTASK: Review pending POs and approve/reject based on budget. Use 'Finance Manager' as your agentName.`;

    response = await sendMessageWithRetry(managerChat, managerInp);

    while (response.response.functionCalls()?.length) {
        const toolResponses = [];
        for (const call of response.response.functionCalls()!) {
            console.log(`   [Manager] Tool: ${call.name}`);
            const result = await executeTool(call.name, call.args);
            toolResponses.push({ functionResponse: { name: call.name, response: { content: result } } });
        }
        response = await sendMessageWithRetry(managerChat, toolResponses);
    }
    console.log("\n💸 MANAGER SUMMARY:\n" + response.response.text());
}

runProcurementSwarm().catch(console.error);
