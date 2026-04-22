export function TextViewer({ content }: { content: string }) {
  return (
    <div className="text-viewer">
      <pre>{content}</pre>
    </div>
  );
}
