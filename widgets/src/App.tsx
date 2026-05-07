import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { LoadingIndicator } from "@openai/apps-sdk-ui/components/Indicator";
import { useState } from "react";
import type { ToolOutput } from "./types";


function App() {
  const [toolOutput, setToolOutput] = useState<ToolOutput | null>(null);

  const { app, error } = useApp({
    appInfo: { name: "Workouts Client", version: "1.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = (result) => {
        if (result.structuredContent) {
          setToolOutput(result.structuredContent as unknown as ToolOutput);
        }
      };
    },
  });

  // 다크 모드 설정
  useHostStyles(app, app?.getHostContext());

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-50 text-red-500">
        Error: {error.message}
      </div>
    )
  }

  return <div className="items-center justify-center flex min-h-50">
    <LoadingIndicator size={32} />
  </div>
}

export default App
