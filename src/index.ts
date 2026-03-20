import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ERP_API_BASE_URL = process.env.ERP_API_URL || "http://localhost:5000/api";

const server = new Server(
    {
        name: "erp-mcp-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Helper to log tool calls to the ERP Core Audit API
 */
const logAudit = async (agentName: string, toolName: string, args: any, status: 'SUCCESS' | 'ERROR', response?: any, error?: string) => {
    try {
        await axios.post(`${ERP_API_BASE_URL}/audit/log`, {
            agentName,
            toolName,
            arguments: args,
            status,
            response,
            error
        });
    } catch (auditError) {
        console.error("Failed to log audit:", auditError instanceof Error ? auditError.message : String(auditError));
    }
};

/**
 * Tool definitions
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const commonProperties = {
        agentName: { type: "string", description: "Name of the agent calling the tool (e.g., 'Procurement Officer' or 'Finance Manager')" }
    };

    return {
        tools: [
            {
                name: "check_low_stock",
                description: "Returns a list of products where current stock is at or below reorder level.",
                inputSchema: {
                    type: "object",
                    properties: { ...commonProperties },
                    required: ["agentName"]
                },
            },
            {
                name: "fetch_vendor_quotes",
                description: "Simulates fetching prices for a SKU from different vendors.",
                inputSchema: {
                    type: "object",
                    properties: {
                        ...commonProperties,
                        sku: { type: "string", description: "The product SKU" }
                    },
                    required: ["agentName", "sku"]
                },
            },
            {
                name: "draft_purchase_order",
                description: "Creates a new purchase order in PENDING_APPROVAL status.",
                inputSchema: {
                    type: "object",
                    properties: {
                        ...commonProperties,
                        vendorId: { type: "string", description: "The ID of the vendor" },
                        items: {
                            type: "array",
                            description: "List of items to purchase",
                            items: {
                                type: "object",
                                properties: {
                                    productId: { type: "string" },
                                    quantity: { type: "number" },
                                    price: { type: "number" }
                                },
                                required: ["productId", "quantity", "price"]
                            }
                        }
                    },
                    required: ["agentName", "vendorId", "items"]
                },
            },
            {
                name: "list_pending_approvals",
                description: "Returns all purchase orders that are in PENDING_APPROVAL status.",
                inputSchema: {
                    type: "object",
                    properties: { ...commonProperties },
                    required: ["agentName"]
                },
            },
            {
                name: "approve_po",
                description: "Updates a purchase order status to 'APPROVED'.",
                inputSchema: {
                    type: "object",
                    properties: {
                        ...commonProperties,
                        poId: { type: "string", description: "The ID of the purchase order" }
                    },
                    required: ["agentName", "poId"]
                },
            },
            {
                name: "reject_po",
                description: "Updates a purchase order status to 'REJECTED'.",
                inputSchema: {
                    type: "object",
                    properties: {
                        ...commonProperties,
                        poId: { type: "string", description: "The ID of the purchase order" }
                    },
                    required: ["agentName", "poId"]
                },
            },
        ],
    };
});

/**
 * Tool execution logic
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const agentName = (args as any)?.agentName || "UNKNOWN_AGENT";

    try {
        let result: any;

        if (name === "check_low_stock") {
            const response = await axios.get(`${ERP_API_BASE_URL}/inventory`);
            const products = response.data.data;
            result = products.filter((p: any) => p.currentStock <= p.reorderLevel);
        }
        else if (name === "fetch_vendor_quotes") {
            const { sku } = args as { sku: string };
            result = [
                { vendor: "Global Supplies", sku, price: 4200, leadTime: "3 days" },
                { vendor: "Precision Tools Co", sku, price: 4100, leadTime: "5 days" },
                { vendor: "Budget Parts Inc", sku, price: 3900, leadTime: "10 days" },
            ];
        }
        else if (name === "draft_purchase_order") {
            const response = await axios.post(`${ERP_API_BASE_URL}/procurement/request`, args);
            result = response.data.data;
        }
        else if (name === "list_pending_approvals") {
            const response = await axios.get(`${ERP_API_BASE_URL}/procurement/pending`);
            result = response.data.data;
        }
        else if (name === "approve_po") {
            const { poId } = args as { poId: string };
            const response = await axios.patch(`${ERP_API_BASE_URL}/procurement/${poId}/status`, {
                status: "APPROVED"
            });
            result = response.data.data;
        }
        else if (name === "reject_po") {
            const { poId } = args as { poId: string };
            const response = await axios.patch(`${ERP_API_BASE_URL}/procurement/${poId}/status`, {
                status: "REJECTED"
            });
            result = response.data.data;
        }
        else {
            throw new Error(`Tool not found: ${name}`);
        }

        // Success Audit
        await logAudit(agentName, name, args, 'SUCCESS', result);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };

    } catch (error: any) {
        let errorMessage = "An error occurred";
        if (axios.isAxiosError(error)) {
            errorMessage = error.response?.data?.error || error.message;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }

        // Error Audit
        await logAudit(agentName, name, args, 'ERROR', undefined, errorMessage);

        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${errorMessage}`,
                },
            ],
            isError: true,
        };
    }
});

/**
 * Start the server
 */
async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("ERP MCP Server running on stdio");
}

runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
