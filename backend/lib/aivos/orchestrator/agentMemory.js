export function createAgentMemory(initial = {}) {
  const state = {
    context:      { ...(initial.context || {}) },
    artifacts:    [...(initial.artifacts || [])],
    conversation: [...(initial.conversation || [])],
    outputs:      { ...(initial.outputs || {}) },
  };

  return {
    getContext() {
      return { ...state.context };
    },

    setContext(key, value) {
      state.context[key] = value;
      return state.context[key];
    },

    mergeContext(patch = {}) {
      Object.assign(state.context, patch);
      return this.getContext();
    },

    addArtifact(ref) {
      const artifact = { id: ref.id || `artifact-${state.artifacts.length + 1}`, ...ref, at: new Date().toISOString() };
      state.artifacts.push(artifact);
      return artifact;
    },

    listArtifacts() {
      return state.artifacts.map((a) => ({ ...a }));
    },

    setOutput(key, value) {
      state.outputs[key] = value;
      return value;
    },

    getOutput(key) {
      return state.outputs[key];
    },

    listOutputs() {
      return { ...state.outputs };
    },

    snapshot() {
      return {
        context:      { ...state.context },
        artifacts:    state.artifacts.map((a) => ({ ...a })),
        conversation: state.conversation.map((m) => ({ ...m })),
        outputs:      { ...state.outputs },
      };
    },

    restore(snapshot = {}) {
      state.context = { ...(snapshot.context || {}) };
      state.artifacts = [...(snapshot.artifacts || [])];
      state.conversation = [...(snapshot.conversation || [])];
      state.outputs = { ...(snapshot.outputs || {}) };
    },

    _conversation: state.conversation,
  };
}
