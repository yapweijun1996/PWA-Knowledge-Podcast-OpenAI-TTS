export function agentToolTurn(name: string, args: Record<string, string>) {
  return {
    status: "completed",
    output: [
      {
        type: "function_call",
        name,
        call_id: "call_fixture",
        arguments: JSON.stringify(args),
        status: "completed",
      },
    ],
  };
}

export function agentAnswerTurn(text: string) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
  };
}
