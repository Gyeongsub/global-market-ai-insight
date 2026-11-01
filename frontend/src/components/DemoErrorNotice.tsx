import React from "react";
import { demoErrorPresentation, type DemoErrorText } from "../data/demo-error.js";

export default function DemoErrorNotice({ error, text }: { error: unknown; text: DemoErrorText }) {
  const message = demoErrorPresentation(error, text);
  return <React.Fragment><div className="empty-insight error-insight"><div>
    <p className="error-code">{message.code}</p><h3>{message.title}</h3>
    <p>{message.body}</p><p>{message.recovery}</p>
  </div></div></React.Fragment>;
}
