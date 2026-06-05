type Props = {
  text: string;
  streaming?: boolean;
};

export default function AgentMessage({ text, streaming }: Props) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-white text-xs font-bold">AI</span>
      </div>
      <div className="prose prose-sm max-w-none text-gray-800">
        <p className="whitespace-pre-wrap leading-relaxed">
          {text}
          {streaming && <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />}
        </p>
      </div>
    </div>
  );
}
