# Example: a well that answers

How a realm on the model in [DESIGN.md](../DESIGN.md) keeps its rules private so they can ask an AI model. Names are invented, and anything built should be the builder's own original work.

## Making it

1. **The actor describes an original place to their agent**, for example: "Make an old well in a village square that answers questions, and everyone there hears the answers." The agent reads the project's [agent guide](../AGENT-GUIDE.md) and writes a `realm.json` with `"privateRules": true`, a rules module and a renderer module.
2. **A question is a move.** The renderer sends `{ ask: "..." }` as the actor's move (`emind.act`). That move is the whole call into the private side.
3. **The rules answer on the maker's machine.** They run under the host program with no sandbox, so `act` can wait for an AI model (through OpenRouter, a service offering many models, some free), using the maker's own key from that machine's environment. With no key set, the well only echoes the question, so the example runs anywhere.
4. **The answer comes back in the views.** Every visitor's view holds the last 12 questions and answers, so everyone at the well hears every answer. Each visitor may have one question waiting at a time.
5. **Strangers' words are not instructions.** The rules shorten each question and tell the model to treat it only as something to answer, in words suitable for all ages.

## Putting it online

- `deno task host --server <web address> --realm examples/listening-well` uploads the renderer (never the rules), announces the realm and referees it, printing its link. The realm is online while that program runs.
- Visitors open the link in a browser like any other realm. The portal tells them the rules are private, so they trust the well the way they trust a website's server.
- A browser tab cannot publish or referee this realm, since it never has the rules.

A working version of this example is in this repository under `examples/listening-well/`.
