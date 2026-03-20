# ERP MCP Server

The **Model Context Protocol (MCP)** server bridge that enables AI agents to interact with the [Headless ERP Core](https://github.com/bharathbbg/headless-erp-core).

## 🚀 Overview
The `erp-mcp-server` wraps the Headless ERP Core APIs into standardized Model Context Protocol tools. This allows LLM-based agents (e.g., in Claude Desktop, VS Code, or custom AI workers) to automate inventory management and procurement tasks while adhering to the business rules and safety logic defined in the core.

## 🛠 Available Tools

### 1. **Inventory Management**
- `check_low_stock`: Returns products whose current stock is at or below the reorder level.

### 2. **Procurement Workflow**
- `fetch_vendor_quotes`: Simulates multi-vendor price fetching for a specific SKU.
- `draft_purchase_order`: Submits a PENDING_APPROVAL PO request based on the selected vendor.
- `list_pending_approvals`: Retrieves all POs awaiting review.
- `approve_po`: Updates a PO status to 'APPROVED' (blocks non-human approval for > 100k amounts).
- `reject_po`: Rejects a PO request based on budget or vendor checks.

### 3. **AI Handoff & Governance**
- `handoff_to_manager`: A specialized tool for the "Procurement Officer" agent to notify the "Finance Manager" agent of a drafted PO.
- `view_audit_logs`: Provides full visibility into recent system-wide agent actions.

## 🏁 Getting Started

### Prerequisites
- Node.js (LTS)
- Running instance of the **Headless ERP Core** (by default at `http://localhost:5000/api`)

### Installation & Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your environment variables in `.env`:
   ```env
   ERP_API_URL=http://localhost:5000/api
   ```

### 🧱 MCP Client JSON Configuration Example
Add the following to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "erp-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/erp-mcp-server/build/index.js"],
      "env": {
        "ERP_API_URL": "http://localhost:5000/api"
      }
    }
  }
}
```

## 📄 Development
To build the server for use:
```bash
npm run build
npm start
```

---
Part of the **ERP Agentic Orchestration** project.
