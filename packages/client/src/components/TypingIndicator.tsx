import { useAppContext } from '../context/AppContext';

export default function TypingIndicator({ channelId }: { channelId: string }) {
  const { state } = useAppContext();
  const typingMap = state.typingUsers.get(channelId);
  if (!typingMap || typingMap.size === 0) return null;

  const names = [...typingMap.values()].map(t => t.displayName);

  let text: string;
  if (names.length === 1) {
    text = `${names[0]} 正在输入…`;
  } else if (names.length <= 3) {
    text = `${names.join(', ')} 正在输入…`;
  } else {
    text = '多人正在输入…';
  }

  return (
    <div className="typing-indicator">
      <span className="typing-dots" />
      {text}
    </div>
  );
}
