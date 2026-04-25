package ws

import "sync"

type AgentCommand struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Usage       string         `json:"usage"`
	Params      []CommandParam `json:"params,omitempty"`
}

type CommandParam struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Required bool   `json:"required,omitempty"`
}

type storedCommand struct {
	AgentCommand
	AgentID      string
	AgentName    string
	ConnectionID string
}

type CommandStore struct {
	mu       sync.RWMutex
	commands []storedCommand
	byConn   map[string][]storedCommand
	byName   map[string][]storedCommand
}

func NewCommandStore() *CommandStore {
	return &CommandStore{
		byConn: make(map[string][]storedCommand),
		byName: make(map[string][]storedCommand),
	}
}

func (cs *CommandStore) Register(connectionID, agentID, agentName string, cmds []AgentCommand) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	cs.removeByConnLocked(connectionID)

	if len(cs.commands)+len(cmds) > 100 {
		allowed := 100 - len(cs.commands)
		if allowed < 0 {
			allowed = 0
		}
		cmds = cmds[:allowed]
	}

	for _, cmd := range cmds {
		sc := storedCommand{
			AgentCommand: cmd,
			AgentID:      agentID,
			AgentName:    agentName,
			ConnectionID: connectionID,
		}
		cs.commands = append(cs.commands, sc)
		cs.byConn[connectionID] = append(cs.byConn[connectionID], sc)
		cs.byName[cmd.Name] = append(cs.byName[cmd.Name], sc)
	}
}

func (cs *CommandStore) UnregisterByConnection(connectionID string) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	return cs.removeByConnLocked(connectionID)
}

func (cs *CommandStore) removeByConnLocked(connectionID string) bool {
	old, had := cs.byConn[connectionID]
	if !had {
		return false
	}
	delete(cs.byConn, connectionID)

	oldNames := make(map[string]bool, len(old))
	for _, c := range old {
		oldNames[c.Name] = true
	}

	filtered := cs.commands[:0]
	for _, c := range cs.commands {
		if c.ConnectionID != connectionID {
			filtered = append(filtered, c)
		}
	}
	cs.commands = filtered

	for name := range oldNames {
		entries := cs.byName[name]
		f := entries[:0]
		for _, e := range entries {
			if e.ConnectionID != connectionID {
				f = append(f, e)
			}
		}
		if len(f) == 0 {
			delete(cs.byName, name)
		} else {
			cs.byName[name] = f
		}
	}
	return true
}

type AgentCommands struct {
	AgentID   string         `json:"agent_id"`
	AgentName string         `json:"agent_name"`
	Commands  []AgentCommand `json:"commands"`
}

func (cs *CommandStore) GetAll() []AgentCommands {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	grouped := make(map[string]*AgentCommands)
	for _, sc := range cs.commands {
		ac, ok := grouped[sc.AgentID]
		if !ok {
			ac = &AgentCommands{AgentID: sc.AgentID, AgentName: sc.AgentName}
			grouped[sc.AgentID] = ac
		}
		ac.Commands = append(ac.Commands, sc.AgentCommand)
	}

	result := make([]AgentCommands, 0, len(grouped))
	for _, ac := range grouped {
		result = append(result, *ac)
	}
	return result
}

func (cs *CommandStore) GetByName(name string) []storedCommand {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.byName[name]
}
