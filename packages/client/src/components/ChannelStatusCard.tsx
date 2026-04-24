interface ChannelStatusCardProps {
  channelName: string;
  topic: string;
  members: Array<{ user_id: string; display_name: string; role: string }>;
  onlineUserIds: string[];
}

export default function ChannelStatusCard({ channelName, topic, members, onlineUserIds }: ChannelStatusCardProps) {
  const onlineSet = new Set(onlineUserIds);
  const online = members.filter(m => onlineSet.has(m.user_id));
  const offline = members.filter(m => !onlineSet.has(m.user_id));

  return (
    <div className="rounded-lg bg-zinc-800 p-4 text-sm text-zinc-200">
      <h3 className="mb-2 text-base font-semibold">#{channelName}</h3>
      <p className="mb-3 text-zinc-400">主题: {topic || '无'}</p>
      <p className="mb-3 text-zinc-400">成员: {members.length} (在线 {online.length})</p>

      {online.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 font-medium text-zinc-300">🟢 在线</p>
          <ul className="space-y-0.5">
            {online.map(m => (
              <li key={m.user_id} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span>{m.display_name}</span>
                {m.role === 'agent' && (
                  <span className="rounded bg-zinc-700 px-1 text-xs text-zinc-400">agent</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {offline.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-zinc-300">⚫ 离线</p>
          <ul className="space-y-0.5">
            {offline.map(m => (
              <li key={m.user_id} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
                <span>{m.display_name}</span>
                {m.role === 'agent' && (
                  <span className="rounded bg-zinc-700 px-1 text-xs text-zinc-400">agent</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
