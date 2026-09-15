const fs=require('node:fs'),path=require('node:path');
const {compare,defaults}=require('./model.cjs');
const cases=[
 ['Earlier linear scenario',{tokenReduction:.5,failureReduction:.8,fixedEnergyShare:0}],
 ['Same improvements, 40% fixed energy',{tokenReduction:.5,failureReduction:.8,fixedEnergyShare:.4}],
 ['Moderate assumptions',{}],
 ['Moderate, only half of predicted energy savings realized',{physicalSavingsFraction:.5}],
 ['Overhead only',{tokenReduction:0,failureReduction:0,falseReject:0,gateEnergyRatio:.05}],
 ['More tokens and more failures',{tokenReduction:-.1,failureReduction:-.5}],
 ['Moderate, double submitted demand',{demandMultiplier:2}],
 ['Dry model site, water-intensive verifier',{siteWUE:0,gridFreshLPerKWh:.1,gateWUE:2,gateGridFreshLPerKWh:2,gateEnergyRatio:.25}]
].map(([name,input])=>({name,...compare(input)}));
const regimes=[
 ['illustrative wet',{modelPUE:1.2,siteWUE:.5,gridFreshLPerKWh:1,gatePUE:1.2,gateWUE:.5,gateGridFreshLPerKWh:1}],
 ['illustrative dry',{modelPUE:1.4,siteWUE:0,gridFreshLPerKWh:1,gatePUE:1.4,gateWUE:0,gateGridFreshLPerKWh:1}],
 ['different verifier site',{modelPUE:1.4,siteWUE:0,gridFreshLPerKWh:.1,gatePUE:1.2,gateWUE:2,gateGridFreshLPerKWh:2}]
];
const rows=[];
for(const tokenReduction of [-.1,0,.2,.5,.8])
for(const failureReduction of [-.5,0,.5,.8])
for(const fixedEnergyShare of [0,.4,.8])
for(const physicalSavingsFraction of [0,.5,1])
for(const gateEnergyRatio of [0,.02,.1,.25])
for(const falseReject of [0,.01,.1])
for(const [regime,water] of regimes)
for(const demandMultiplier of [1,1.5,2,3]){
 const input={tokenReduction,failureReduction,fixedEnergyShare,physicalSavingsFraction,gateEnergyRatio,falseReject,demandMultiplier};
 const r=compare({...input,...water});
 rows.push({regime,...input,completion:r.protocol.completion,waterSavedPerCompletionPct:r.savingsPct.freshL,energySavedPerCompletionPct:r.savingsPct.facilityKWh,totalWaterChangePct:r.totalChangePct.freshL,totalEnergyChangePct:r.totalChangePct.facilityKWh,waterDemandBreakEven:r.breakEvenDemand.freshL});
}
const keys=Object.keys(rows[0]);
fs.writeFileSync(path.join(__dirname,'grid.csv'),keys.join(',')+'\n'+rows.map(r=>keys.map(k=>r[k]).join(',')).join('\n'));
fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({status:'HYPOTHETICAL',defaults,regimes,scenarioCount:rows.length,cases},null,2));
const fmt=x=>x===null?'undefined':x.toFixed(2);
const table=cases.map(r=>`| ${r.name} | ${fmt(r.protocol.completion*100)}% | ${fmt(r.savingsPct.freshL)}% | ${fmt(r.savingsPct.facilityKWh)}% | ${fmt(r.totalChangePct.freshL)}% |`).join('\n');
fs.writeFileSync(path.join(__dirname,'RESULTS.md'),`# Resource simulation v2\n\nAll values are synthetic scenario inputs. Positive savings mean less consumption; positive total change means more consumption.\n\n| Assumed scenario | Completion | Freshwater saved per completion | Electricity saved per completion | Total freshwater change |\n|---|---:|---:|---:|---:|\n${table}\n\n${rows.length.toLocaleString()} combinations evaluated. Grid frequencies are not probabilities. Per-completion metrics include resources spent on failed submissions. See README.md for equations and units.\n`);
console.log(JSON.stringify({combinations:rows.length,cases:cases.map(r=>({name:r.name,waterSavingsPct:r.savingsPct.freshL,energySavingsPct:r.savingsPct.facilityKWh,totalWaterChangePct:r.totalChangePct.freshL,completionPct:r.protocol.completion*100}))},null,2));
