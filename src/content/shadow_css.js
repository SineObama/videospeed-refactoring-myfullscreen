const shadow_css = `
* {
    line-height: 1.8em;
    font-family: sans-serif;
    font-size: 13px;
  }
  
  :host(:hover) #controls {
    display: inline;
  }
  
  #controller {
    position: absolute;
    top: 0;
    left: 0;
  
    background: black;
    color: white;
  
    border-radius: 6px;
    padding: 4px;
    margin: 10px 10px 10px 15px;
  
    cursor: default;
    z-index: 9999999;
  }
  
  #controller:hover {
    opacity: 0.7;
  }
  
  #controller:hover > .draggable {
    margin-right: 0.8em;
  }
  
  #controls {
    display: none;
  }
  
  #controller.dragging {
    cursor: -webkit-grabbing;
    opacity: 0.7;
  }
  
  #controller.dragging #controls {
    display: inline;
  }
  
  .draggable {
    cursor: -webkit-grab;
  }
  
  .draggable:active {
    cursor: -webkit-grabbing;
  }
  
  button {
    opacity: 1;
    cursor: pointer;
    color: black;
    background: white;
    font-weight: normal;
    border-radius: 5px;
    padding: 1px 5px 3px 5px;
    font-size: 14px;
    line-height: 14px;
    border: 0px solid white;
    font-family: "Lucida Console", Monaco, monospace;
    margin: 0px 2px 2px 2px;
    transition: background 0.2s, color 0.2s;
  }
  
  button:focus {
    outline: 0;
  }
  
  button:hover {
    opacity: 1;
    background: #2196f3;
    color: #ffffff;
  }
  
  button:active {
    background: #2196f3;
    color: #ffffff;
    font-weight: bold;
  }
  
  button.rw {
    opacity: 0.65;
  }
  
  button.hideButton {
    opacity: 0.65;
    margin-right: 2px;
  }  
`;

module.exports = shadow_css;
