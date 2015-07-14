/**
 * Created by joey on 5/28/15.
 */

// Define the dimensions of the visualization.
var width = innerWidth,
    height = innerHeight,
    color = d3.scale.category20(),
    root;

// Create an array logging what is connected to what
var linkedByIndex = { };

// Create the SVG container for the visualization and define its dimensions
var svg = d3.select('body').append('svg')
    .attr('width', width)
    .attr('height', height);

var link = svg.selectAll(".link"),
    node = svg.selectAll(".node"),
    linkText;

// Mouse Event Variables
var selected_node = null,
    selected_link = null,
    mousedown_node = null,
    mousedown_link = null,
    mouseup_node = null;

// Create the force layout
var force = d3.layout.force()
    .size([width, height])
    .charge(-650)
    .linkDistance(100);

// nodes and links variables
var edges = []; // Contains all edges
var nodes = []; // Contains all nodes
var nodesHash = {}; // Used for making nodes[] unique.
var selectedNodes = []; // Contains all nodes that are currently selected
var mergedNodesStore = [];
var mergedNodes = []; // Contains the Node Fusion of nodes.
var childEdges = []; // Contains the eges of the merged Nodes.
var mnCount = 0;
var merged;

// JSON vars
var jsonStack = {};
var jsonCount = 0;
var jsonPath1 = "../../test/resources/cytoscape.json";
var jsonPath2 = "../../test/resources/cytoscapeexpand.json";

// Read in the JSON data.
d3.json(jsonPath1, function (error, json) {
    // expands scope of json
//    jsonStack[jsonCount] = json;
//    root = jsonStack[jsonCount];
    root = json;
    console.log("Successfully loaded" + json);
    //console.log(JSON.stringify(root));
    establishGraph();
    jsonCount += 1;
});

d3.select('#expand').on("click", function () {
    expandNode();
});

d3.select('#expand1').on("click", function () {
    d3.json(jsonPath2, function (error, json) {
        // expands scope of json
        root = json
        establishGraph();
    });
});

d3.select('#hide').on("click", function () {
    hideNode();
});

d3.select('#unhide').on("click", function () {
    revealNode();
});

d3.select('#delete').on("click", function () {
    deleteNode();
});

d3.select('#merge').on("click", function () {
    mergeNode();
});

d3.select('#selected').on("click", function () {
    var printSelected;
    if (selectedNodes.length > 0) {
        for (var i = 0; i < selectedNodes.length; i++) {
            console.log(selectedNodes[i].data.id);
            printSelected += selectedNodes[i].data.id + "\n"
        }
        alert("Selected Nodes: \n" + printSelected);
    }
    else alert("No node(s) selected");
});

// Variables used in graph.
var url = "rest/csgraph/customer/"
var urlLim = "?_dc=1430253408283&degree=1&useSaved=true&maxEdgesPerNode=40&maxNodes=1000&page=1&start=0&limit=25"

// Reads in the key used to generate graph.
var parm = window.location.search;
if (parm && parm.length > 1) {

    parm = parm.substring(1); // ditch the leading '?'
    parms = parm.split("&");
    var schemas = [];
    var entities = [];
    var tabToDisplay = "3";
    var useSaved = true;
    for (var i = 0; i < parms.length; ++i) {
        var p = parms[i];
        var x = p.split("=");
        if (x[0] == 'schema') {
            console.log("Schema: " + x[1]);
            schemas.push(x[1]);
        }
        else if (x[0] == 'entity') {
            console.log("Entity: " + x[1]);
            entities.push(x[1]);
        }
        else if (x[0] == "display") {
            console.log("Display: " + x[1]);
            tabToDisplay = x[1];
        }
        else if (x[0] == "useSaved") {
            console.log("UseSaved: " + x[1]);
            useSaved = x[1];
        }
    }
    if (entities.length > 0) {
        ajaxCall(entities[0]);
    }
}
;

function ajaxCall(grapheneKey) {
    $.ajax({
        type: "GET",
        url: url + grapheneKey + urlLim,
        crossDomain: true,
        headers: { 'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT' },
        async: true,
        dataType: "json",
        success: function (data) {
            root = data;
            alert("Success! Received: " + root);
            establishGraph();
        }
    });
}

function establishGraph() {

    // pushes the NODE attributes in the JSON to the nodes array.
    root.nodes.forEach(function (n) {
        // if node already exists it does not get pushed to the nodes array.
        if (!(n.data.id in nodesHash)) {
            nodesHash[n.data['id']] = n;
            nodes.push({
                data: n.data,
                selected: n.selected,
                removed: n.removed
            });
        }
        else console.log(n.data.id + "already exists.");
    });

    // sets the source and target to use id instead of index
    root.edges.forEach(function (e) {
        var sourceNode = nodes.filter(function (n) {
                return n.data.id === e.data.source;
            })[0],
            targetNode = nodes.filter(function (n) {
                return n.data.id === e.data.target;
            })[0];

        // push the EDGE attributes in the JSON to the edges array.
        edges.push({
            source: sourceNode,
            target: targetNode,
            data: e.data
        });
    });

    force
        .nodes(nodes)
        .links(edges)
    update();
}

function update() {

    // refresh list of selected nodes
    selectedNodes = nodes.filter(function (d) {
        return d.selected;
    });

    // Update link data based on edges array.
    link = link.data(edges);

    // Create new links
    link.enter().append("line")
        .attr("class", "link")
        .style("stroke-width", 1.5);

    // Delete removed links
    link.exit().remove();

    // Update node data based on nodes array.
    node = node.data(nodes);

    // Create new nodes
    node.enter().append("g")
        .attr("class", "node")
        .attr("id", function (d) {
            return d.data['id']
        })
        //.attr("fixed", function(d) { return d.fixed=true })
        .call(force.drag)
        .on('mouseover', connectedNodes)
        .on('mouseleave', restore)
        //.on('dblclick', highlight)
        .on('dblclick', highlight);

    // Delete removed nodes
    node.exit().remove();

    node.append("circle").attr("r", 11);
    node.classed("selected", function (d) {
        return d === d.selected;
    })

    // Node behavior for checking if the node is hidden.
    node.style("visibility", function (d) {
        if (d.data['visible'] === false) {
            console.log(d.data['id'] + " is hidden.")
            return "hidden";
        }
        else {
            return "visible";
        }
    });

    // Node behavior for checking if selected otherwise colors nodes to color given from JSON.
    node.style("fill", function (d) {
        if (d.selected === false) {
            console.log("Not Highlighting " + d.data['id'] + " selected is " + d.selected);
            return d.data['color']
            update();
        }
        else {
            console.log("Highlighting " + d.data['id'] + " selected is " + d.selected);
            return "yellow";
            update();
        }
    }).select("circle").style("stroke", "black");

    // Link color and visibility based on JSON data.
    link.style("stroke", function (d) {
        return d.data['color']
    })
        .style("visibility", function (d) {
            if (d.data['visible'] === false) {
                console.log("what the")
                return "hidden";
            }
            else {
                console.log("alfdmlkgm")
                return "visible";
            }
        });

    // Adds text to nodes
    node.append("text")
        .attr("dx", 12)
        .attr("dy", ".35em")
        .style("fill", "black")
        .text(function (d) {
            return d.data['label'];
        });

    // Creates an index used to figure out neighbor nodes.
    root.edges.forEach(function (d) {
        linkedByIndex[d.data.source + "," + d.data.target] = 1;
    });

    // responsive behavior for graph based on window.
    window.addEventListener('resize', resize);

    force.on("tick", function () {
        link.attr("x1", function (d) {
            return d.source.x;
        })
            .attr("y1", function (d) {
                return d.source.y;
            })
            .attr("x2", function (d) {
                return d.target.x;
            })
            .attr("y2", function (d) {
                return d.target.y;
            });

        node.attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });
    });
    force.start();
}

// Returns a list of all nodes under the root.
function flatten(root) {
    i = 0;

    function recurse(node) {
        if (node.children) node.children.forEach(recurse);
        if (!node.id) node.id = ++i;
        nodes.push(node);
    }

    recurse(root);
    return nodes;
}

// This function looks up whether a pair are neighbours
function neighboring(a, b) {
    return linkedByIndex[a.data.id + "," + b.data.id];
}

function connectedNodes() {
    // Remember any changes done here must have an 'undo' in the restore() function.

    d = d3.select(this).node().__data__;

    // Changes to all but the neighboring nodes
    node.style("opacity", function (o) {
        return neighboring(d, o) | neighboring(o, d) ? 1 : 0.1;
    })
        .style("stroke", function (o) {
            return neighboring(d, o) | neighboring(o, d) ? "black" : "black";
        });

    // Changes to all but neighboring links
    link.style("opacity", function (o) {
        return d.index == o.source.index | d.index == o.target.index ? 1 : 0.1;
    })
        .style("stroke-width", function (o) {
            return d.index == o.source.index | d.index == o.target.index ? 2.5 : null;
        });

    // Maintains opacity of selected node.
    return d3.select(this).style("opacity", 1).select("circle")
        .attr("r", 13);

}

function restore() {
    node.style("opacity", 1)
        .style("stroke", null)
        .select("circle").attr("r", 11);

    link.style("opacity", 1)
        .style("stroke-width", 1.5);
}

// Movement of graph based on browser window resize.
function resize() {
    width = window.innerWidth, height = window.innerHeight;
    svg.attr("width", width).attr("height", height);
    force.size([width, height]).resume();
}

function resetMouseVars() {
    mousedown_node = null;
    mouseup_node = null;
    mousedown_link = null;
}

// Highlighting of selected node.
function highlight(d) {
//    mousedown_node = d;
//    if (selectedNodes.indexOf(mousedown_node) > -1) {
//        console.log("De-Selected: " + mousedown_node.data['id']);
//        mousedown_node.selected = false;
//    }
//    else {
//        console.log("Selected: " + mousedown_node.data['id']);
//        selectedNodes.push(mousedown_node);
//    }
//    resetMouseVars();
//    update();
    d.selected = !d.selected;
    if (d.selected === false) {
        console.log("De-Selected: " + d.data['id']);
    }
    else console.log("Selected: " + d.data['id']);
    update();
}

function expandNode() {
    if (selectedNodes.length < 0) {
        alert("No node or too many are selected.");
        update();
    }

    else if (selected_node.length = 1) {
        console.log("Expanding using: " + selected_node.data['id']);
        ajaxCall(selected_node.data['id']);
    }
}

// Delete node with prompt
function deleteNode() {
    console.log("Prompted to delete selected nodes.");
    if (confirm("Deleting selected element(s) will remove them from the graph entirely.\nAre you sure? (This cannot be undone).")) {
        if (selectedNodes.length > 0) {
            for (var i = 0; i < selectedNodes.length; i++) {
                nodes.splice(nodes.indexOf(selectedNodes[i]), 1);
                spliceLinksForNode(selectedNodes[i]);
            }
        }
        else alert("No node(s) selected.");
        update();
    }
}

function spliceLinksForNode(node) {
    toSplice = edges.filter(
        function (e) {
            return (e.source === node) || (e.target === node);
        });
    toSplice.map(
        function (e) {
            edges.splice(edges.indexOf(e), 1);
        });
}

/*
 Create a new node X (for now give it a random label, some default position and use a timestamp Id)
 Let X have a data field like List<Node> children
 Let X have a data field like List<Edge> childEdges
 For each selected node n:
 Add n to the list of children
 For each edge e in EDGES that touches n
 Add e to childEdges, remove e from EDGES.
 If e.target == n, create a new edge that goes from X to e.source
 If e.source == n, create a new edge that goes from X to e.target
 */
function mergeNode() {
    mergedNodesStore = [];
    console.log("Attempting to merge nodes.");
    // Check if at least 2 nodes are selected.
    if (selectedNodes.length < 2) {
        alert("Must select at least 2 or more nodes.");
    }
    else {
        // Iterating through each of the selected nodes.
        for (var i = 0; i < selectedNodes.length; i++) {
            mergedNodesStore.push[selectedNodes[i]];
            // Iterates through each of the edges to apply the old links to new merged node.
            for (var j = 0; j < edges.length; j++) {
                var mergedEdge;
                if (selectedNodes[i].data.id === edges[j].data.source) {
                    mergedEdge = edges[j].data.target;
                    edges.push({
                        source: "MergedNode" + mnCount,
                        target: mergedEdge,
                        data: selectedNodes[i].data
                    });
                }
                else if (selectedNodes[i].data.id === edges[j].data.target) {
                    mergedEdge = edges[j].data.source;
                    edges.push({
                        source: "MergedNode" + mnCount,
                        target: mergedEdge,
                        data: selectedNodes[i].data
                    });
                }
            }

            // Remove the merge nodes from the nodes array.
            nodes.splice(nodes.indexOf(selectedNodes[i]), 1);
            spliceLinksForNode(selectedNodes[i]);
        }

        // Push the "MergeNode" to the mergeNodes array.
        mergedNodes.push({
            id: "MergedNode" + mnCount,
            label: "MergedNode" + mnCount,
            childrenNodes: mergedNodesStore
//            x: Math.random(),
//            data: mergedNodesStore,
//            index: nodes.length + 1
        });
        mnCount++;
    }
    insertMergeNodes();
}

function insertMergeNodes() {

    // sets the source and target to use id instead of index
    edges.forEach(function (e) {
        var sourceNode = nodes.filter(function (n) {
                return n.data.id === e.data.source;
            })[0],
            targetNode = nodes.filter(function (n) {
                return n.data.id === e.data.target;
            })[0];

        // push the EDGE attributes in the JSON to the edges array.
        edges.push({
            source: sourceNode,
            target: targetNode,
            data: e.data
        });
    });

    force
        .nodes(mergedNodes)
        .links(edges)

    // Update link data based on edges array.
    link = link.data(edges);

    // Create new links
    link.enter().append("line")
        .attr("class", "link")
        .style("stroke-width", 1.5);

    // Delete removed links
    link.exit().remove();

    // Update node data based on nodes array.
    merged = merged.data(mergedNodes);

    // Create new nodes
    merged.enter().append("g").start()
        .attr("class", "node")
        .attr("id", function (d) {
            return d.data['id']
        })
        //.attr("fixed", function(d) { return d.fixed=true })
        .call(force.drag)
        .on('mouseover', connectedNodes)
        .on('mouseleave', restore)
        //.on('dblclick', highlight)
        .on('dblclick', highlight);

    // Delete removed nodes
    merged.exit().remove();
}


function unMergeNode() {
    var date = new Date();
    date.getTime();

}

function hideNode() {
    // Checks if any nodes are selected.
    if (selectedNodes.length > 0) {

        // Iterates over all of the selected nodes.
        for (var i = 0; i < selectedNodes.length; i++) {

            // Sets the node visible attribute to false and removes the node from the selected array.
            selectedNodes[i].data['visible'] = false;
            selectedNodes[i].selected = false;

            // Iterates through each of the edges to check visibility.
            for (var j = 0; j < edges.length; j++) {
                if (selectedNodes[i].data.id === edges[j].data.source || selectedNodes[i].data.id === edges[j].data.target) {
                    edges[j].data['visible'] = false;
                }
            }
        }
    }
    else alert("No node(s) selected.");
    update();
}

function revealNode() {
//    nodes.forEach(function(d) {
//        d.removed === false;
//    });
    for (var i = 0; i < nodes.length; i++) {
        nodes[i].data['visible'] = true;
        for (var j = 0; j < edges.length; j++) {
            edges[j].data['visible'] = true;
        }
    }
    update();
}

function inputPromptBox() {
    var mergedNodeName = prompt("Please enter the name of the merged node.", "example: mergednode1");

    if (mergedNodeName != null) {
        return mergedNodeName;
    }
}