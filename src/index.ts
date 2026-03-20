import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { executeTool } from "./tools.js";

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
            {
                name: "handoff_to_manager",
                description: "Used by the Procurement Officer to notify the Finance Manager of a drafted PO.",
                inputSchema: {
                    type: "object",
                    properties: {
                        ...commonProperties,
                        poId: { type: "string", description: "The ID of the drafted PO" },
                        notes: { type: "string", description: "Any notes for the manager" }
                    },
                    required: ["agentName", "poId"]
                },
            },
            {
                name: "view_audit_logs",
                description: "Returns the recent system audit logs.",
                inputSchema: {
                    type: "object",
                    properties: { ...commonProperties },
                    required: ["agentName"]
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

    try {
        const result = await executeTool(name, args);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };

    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${error.message}`,
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
