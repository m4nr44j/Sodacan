const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function run(cmd, env = {}) {
	return execSync(cmd, { stdio: 'pipe', cwd: process.cwd(), env: { ...process.env, ...env } }).toString()
}

function hasEdge(graph, pred) {
	return graph.edges.some(pred)
}

function findNode(graph, pred) {
	return graph.nodes.find(pred)
}

function assert(cond, msg) {
	if (!cond) {
		console.error(`Assertion failed: ${msg}`)
		process.exit(1)
	}
}

function main() {
	const projectPath = process.cwd()
	const out = path.resolve(projectPath, 'testing', 'golden-analysis.json')
	const cmd = `node packages/cli/dist/index.js analyze ./ --config ./docufy.config.json --output ${out} --concurrency 8`
	console.log('Running analysis for golden snapshot...')
	run(cmd)
	const goldenPath = path.resolve(projectPath, 'testing', 'golden.expected.json')
	if (!fs.existsSync(goldenPath)) {
		console.log('No golden expected snapshot found. Creating one now...')
		fs.copyFileSync(out, goldenPath)
		console.log('Golden created at testing/golden.expected.json')
		process.exit(0)
	}
	const a = JSON.parse(fs.readFileSync(out, 'utf8'))
	const b = JSON.parse(fs.readFileSync(goldenPath, 'utf8'))
	const aNodes = a.nodes.length, bNodes = b.nodes.length
	const aEdges = a.edges.length, bEdges = b.edges.length
	console.log(`Nodes: current=${aNodes} golden=${bNodes}`)
	console.log(`Edges: current=${aEdges} golden=${bEdges}`)
	if (aNodes !== bNodes || aEdges !== bEdges) {
		if (process.env.GOLDEN_UPDATE === '1') {
			fs.copyFileSync(out, goldenPath)
			console.log('Golden updated to current analysis.')
		} else {
			console.error('Golden mismatch. Set GOLDEN_UPDATE=1 to update.')
			process.exit(1)
		}
	}

	// Key relationship assertions
	console.log('Asserting key edges...')
	// 1) API_CALL exists
	assert(hasEdge(a, (e) => e.type === 'API_CALL'), 'API_CALL edge missing')
	// 2) Kustomize kustomization.yaml -> deployment.yaml
	const kustom = findNode(a, n => n.filePath.endsWith('testing/kustomize/kustomization.yaml'))
	const deploy = findNode(a, n => n.filePath.endsWith('testing/k8s/deployment.yaml') && n.metadata && n.metadata.resourceKind === 'Deployment')
	assert(!!kustom && !!deploy, 'Kustomize nodes not found')
	assert(hasEdge(a, e => e.sourceId === kustom.id && e.targetId === deploy.id && e.type === 'REFERENCES'), 'Kustomize did not reference deployment')
	// 3) Service -> Deployment (K8s selector linking)
	const svc = findNode(a, n => n.filePath.endsWith('testing/k8s/deployment.yaml') && n.metadata && n.metadata.resourceKind === 'Service')
	assert(!!svc, 'Service node not found')
	assert(hasEdge(a, e => e.sourceId === svc.id && e.targetId === deploy.id && e.type === 'REFERENCES'), 'Service did not reference Deployment')
	// 4) Terraform module reference edge
	assert(hasEdge(a, e => e.type === 'REFERENCES' && typeof e.targetId === 'string' && e.targetId.includes('./modules/mod')), 'Terraform module reference edge missing')

	console.log('All assertions passed.')
}

main() 