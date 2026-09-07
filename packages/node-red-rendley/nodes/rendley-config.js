module.exports = function (RED) {
  /** Holds the Rendley API key and base URL; referenced by every Rendley node. */
  function RendleyConfigNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.baseUrl = (config.baseUrl || "https://api.rendley.com/v1").replace(/\/+$/, "");
  }
  RED.nodes.registerType("rendley-config", RendleyConfigNode, {
    credentials: {
      apiKey: { type: "password" },
    },
  });
};
