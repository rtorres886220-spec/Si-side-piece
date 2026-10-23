# Sidekick Extension & Multimodal Vision-Guided Automation Plan

This revised plan confirms the use of **Gemini 3.5 flash-lite** for multimodal visual inspection. Gemini 3.5 flash-lite fully supports multimodal image and text inputs (`inlineData` image parts combined with text instructions), enabling fast, low-latency visual inspection of page screenshots and popups before executing CDP clicks.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Decision**: Use **Gemini 3.5 flash-lite** for multimodal vision inspection. The model receives base64 screenshots and DOM context to analyze layout and verify target element coordinates.
> - **Confirmed Decision**: Server-side proxy routing via `server.ts` using `@google/genai` and `process.env.GEMINI_API_KEY`.

---

## 1. Overview & Core Concept

- **What It Fixes**: Eliminates blind clicking on blank areas by passing viewport screenshots to Gemini 3.5 flash-lite for visual layout analysis and coordinate verification.
- **Key Value**: Low-latency multimodal closed-loop automation.

---

## 2. Technical Implementation Details

- **Multimodal Payload Structure**:
  ```ts
  const imagePart = {
    inlineData: {
      mimeType: "image/png",
      data: base64Screenshot,
    },
  };
  const textPart = {
    text: "Analyze this browser screenshot and modal. Locate the correct answer for 'Which of these is not an animal?' and provide the exact bounding box (x, y) coordinates for 'Cabbage'.",
  };
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: { parts: [imagePart, textPart] },
  });
  ```
