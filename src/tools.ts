import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ERP_API_BASE_URL = process.env.ERP_API_URL || "http://localhost:5000/api";

/**
 * Helper to log tool calls to the ERP Core Audit API
 */
export const logAudit = async (agentName: string, toolName: string, args: any, status: 'SUCCESS' | 'ERROR', response?: any, error?: string) => {
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
 * Core Tool Execution Engine
 */
export async function executeTool(name: string, args: any): Promise<any> {
    const agentName = args?.agentName || "UNKNOWN_AGENT";

    try {
        let result: any;

        if (name === "check_low_stock") {
            const response = await axios.get(`${ERP_API_BASE_URL}/inventory`);
            const products = response.data.data;
            result = products.filter((p: any) => p.currentStock <= p.reorderLevel);
        }
        else if (name === "fetch_vendor_quotes") {
            const { sku } = args as { sku: string };
            const response = await axios.get(`${ERP_API_BASE_URL}/vendor/quotes/${sku}`);
            result = response.data.data;
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
                status: "APPROVED",
                agentName
            });
            result = response.data.data;
        }
        else if (name === "reject_po") {
            const { poId } = args as { poId: string };
            const response = await axios.patch(`${ERP_API_BASE_URL}/procurement/${poId}/status`, {
                status: "REJECTED",
                agentName
            });
            result = response.data.data;
        }
        else if (name === "handoff_to_manager") {
            const { poId, notes } = args as { poId: string, notes: string };
            result = {
                status: "NOTIFIED",
                message: `Finance Manager has been notified about PO ${poId}.`,
                details: notes
            };
        }
        else if (name === "view_audit_logs") {
            const response = await axios.get(`${ERP_API_BASE_URL}/audit`);
            result = response.data.data;
        }
        else {
            throw new Error(`Tool not found: ${name}`);
        }

        // Success Audit
        await logAudit(agentName, name, args, 'SUCCESS', result);
        return result;

    } catch (error: any) {
        let errorMessage = "An error occurred";
        if (axios.isAxiosError(error)) {
            errorMessage = error.response?.data?.error || error.message;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }

        // Error Audit
        await logAudit(agentName, name, args, 'ERROR', undefined, errorMessage);
        throw new Error(errorMessage);
    }
}
