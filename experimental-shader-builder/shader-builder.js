(function () {
	'use strict';

	/**
	 * Perform a topological sort of a graph
	 * @param graph
	 * @returns {Array} Ordered nodes
	 */
	function sort(graph) {
		var unvisited = new Set(graph.keys());
		var visited = new Set();
		var order = [];

		function df(nodeId) {
			if (visited.has(nodeId)) {
				return;
			}

			visited.add(nodeId);
			unvisited.delete(nodeId);

			graph.get(nodeId).outputsTo.filter(function (output) {
				return output.to !== '_';
			}).forEach(function (output) {
				df(output.to);
			});

			order.push(graph.get(nodeId));
		}

		while (unvisited.size) {
			df(unvisited.values().next().value);
		}

		return order;
	}

	/**
	 * Converts a node structure (an array) into something
	 * usable by the topological sorter (a map)
	 * @param {Array} structure
	 * @returns {Map<string, node>}
	 */
	function toGraph(structure) {
		var graph = new Map();

		structure.forEach(function (node) {
			graph.set(node.id, node);
		});

		return graph;
	}

	/**
	 * Generates an input variable name for transfering data between nodes
	 * @param nodeId
	 * @param varName
	 * @returns {string}
	 */
	function getInputVar(nodeId, varName) {
		return 'inp_' + nodeId + '_' + varName;
	}

	/**
	 * Generates code for "external" nodes (that just bridge a uniform/attribute/varying)
	 * @param node
	 * @param typeDefinition
	 * @returns {string}
	 */
	function generateExternalCode(node, typeDefinition) {
		return node.outputsTo.map(function (outputTo) {
			return '\t' + getInputVar(outputTo.to, outputTo.input) +
				' = ' + node.external.name + ';';
		}).join('\n');
	}

	/**
	 * Generates code for "normal" nodes
	 * @param node
	 * @param typeDefinition
	 * @returns {string}
	 */
	function generateNodeCode(node, typeDefinition) {
		var outputDeclarations = '';
		if (typeDefinition.outputs) {
			outputDeclarations = typeDefinition.outputs.map(function (output) {
				return '\t' + output.type + ' ' + output.name + ';';
			}).join('\n');
		}


		// copy the outputs of this node to the inputs of the next node
		var copyOut = node.outputsTo.map(function (outputTo) {
			return '\t' + getInputVar(outputTo.to, outputTo.input) +
				' = ' + outputTo.output + ';';
		}).join('\n');


		// body
		var bodyGenerator = jsTemplate.getCodeGenerator(node.type, typeDefinition.body);
		// have global and local defines (local ones shadow global ones)
		var bodyCode = bodyGenerator(node.defines);


		// process inputs (from other shader's outputs)
		var processedBody = typeDefinition.inputs.reduce(function (partial, input) {
			// should do a tokenization of the shader coder instead
			// this regex will fail for comments, strings
			return partial.replace(
				new RegExp('\\b' + input.name + '\\b', 'g'),
				getInputVar(node.id, input.name)
			);
		}, bodyCode);

		return outputDeclarations + '\n' +
			'\t' + processedBody + '\n' +
			copyOut;
	}

	/**
	 * Generate code given node types and an array of sorted nodes
	 * @param nodeTypes
	 * @param nodes
	 * @returns {string}
	 */
	function generateCode(nodeTypes, nodes) {
		var stringifiedExternals = nodes.filter(function (node) {
			return node.type === 'external';
		}).map(function (node) {
			return node.external.inputType + ' ' + node.external.dataType + ' ' + node.external.name + ';';
		}).join('\n');


		// declare the inputs of all nodes
		var copyIn = nodes.filter(function (node) {
			if (node.type === 'external') { return false; }
			return nodeTypes[node.type].inputs.length > 0;
		}).map(function (node) {
			var nodeDefinition = nodeTypes[node.type];

			return '// node ' + node.id + ', ' + node.type + '\n' +
				nodeDefinition.inputs.map(function (input) {
					return input.type + ' ' + getInputVar(node.id, input.name) + ';';
				}).join('\n');
		}).join('\n');


		var stringifiedNodes = nodes.map(function (node) {
			var typeDefinition = nodeTypes[node.type];

			var nodeCode = (
				node.type === 'external' ?
				generateExternalCode :
				generateNodeCode
			)(node, typeDefinition);

			return '// node ' + node.id + ', ' + node.type + '\n' +
				'{\n' +
				nodeCode + '\n' +
				'}\n';
		}).join('\n');

		return stringifiedExternals + '\n\nvoid main(void) {\n' +
			copyIn + '\n\n' +
			stringifiedNodes + '\n' +
			'}';
	}

	/**
	 * Generate code given node types and the graph-like structure of nodes
	 * @param types
	 * @param structure
	 * @returns {string}
	 */
	function buildShader(types, structure) {
		var graph = toGraph(structure);
		var sorted = sort(graph);
		sorted.reverse(); // easier to reverse this than to invert the graph
		return generateCode(types, sorted);
	}

	window.shaderBits = window.shaderBits || {};
	window.shaderBits.buildShader = buildShader;
})();