/* Hypothetical resource accounting, not measured POPCORN performance. No I/O. */
(function(root) {
  'use strict';
  const defaults = {
    tokens:10000, executionSuccess:0.8, attempts:3,
    tokenReduction:0.2, failureReduction:0.5, falseReject:0.01,
    fixedEnergyShare:0.4, energyExponent:1, physicalSavingsFraction:1,
    modelITkWh:0.001, fixedITkWhPerSubmission:0,
    gateEnergyRatio:0.02, modelPUE:1.2, gatePUE:1.2,
    siteWUE:0.5, siteFreshFraction:1, gridFreshLPerKWh:1,
    gateWUE:0.5, gateFreshFraction:1, gateGridFreshLPerKWh:1,
    modelSeconds:20, fixedTimeShare:0.2, gateSeconds:0.4,
    modelCost:0.02, fixedCostShare:0, gateCost:0,
    witnessPrice:0.001, paidWitnessesPerAttempt:0,
    humanMinutesPerExecution:0, humanReviewReduction:0,
    humanMinutesPerGate:0, humanDollarsPerHour:30,
    submissions:1000000, demandMultiplier:1
  };
  const bounded=['executionSuccess','falseReject',
    'fixedEnergyShare','physicalSavingsFraction','siteFreshFraction','gateFreshFraction',
    'fixedTimeShare','fixedCostShare','humanReviewReduction'];
  function parameters(input={}) {
    for(const key of Object.keys(input)) if(!(key in defaults)) throw Error('Unknown input: '+key);
    const c={...defaults,...input};
    for(const [k,v] of Object.entries(c)) if(!Number.isFinite(v)||(v<0&&!['tokenReduction','failureReduction'].includes(k))) throw Error('Invalid input: '+k);
    for(const k of ['tokenReduction','failureReduction']) if(c[k]<-1||c[k]>1) throw Error(k+' must be between -1 and 1');
    for(const k of bounded) if(c[k]>1) throw Error(k+' must be between 0 and 1');
    if(!Number.isInteger(c.attempts)||c.attempts<1||c.attempts>100) throw Error('attempts must be 1..100');
    if(c.modelPUE<1||c.gatePUE<1) throw Error('PUE must be >=1');
    if(c.energyExponent<=0) throw Error('energyExponent must be >0');
    return c;
  }
  function divide(a,b){return b>0?a/b:null;}
  function run(c,enabled) {
    const pass=enabled?1-c.falseReject:1;
    const p=enabled?Math.max(0,1-(1-c.executionSuccess)*(1-c.failureReduction)):c.executionSuccess;
    const s=pass*p;
    let attempts=0, remaining=1;
    for(let i=0;i<c.attempts;i++){attempts+=remaining;remaining*=1-s;}
    const completion=1-remaining, executions=attempts*pass;
    const reduction=enabled?c.tokenReduction:0;
    const tokenFraction=1-reduction;
    const allocatedFactor=c.fixedEnergyShare+(1-c.fixedEnergyShare)*tokenFraction**c.energyExponent;
    const targetIT=c.fixedITkWhPerSubmission+executions*c.modelITkWh*allocatedFactor;
    let baselineAttempts=0;
    for(let i=0;i<c.attempts;i++) baselineAttempts+=(1-c.executionSuccess)**i;
    const baselineIT=c.fixedITkWhPerSubmission+baselineAttempts*c.modelITkWh;
    // Capture applies only to predicted reductions; extra work always incurs energy.
    const modelIT=enabled&&targetIT<baselineIT?baselineIT-c.physicalSavingsFraction*(baselineIT-targetIT):targetIT;
    const gateIT=enabled?attempts*c.modelITkWh*c.gateEnergyRatio:0;
    const modelFacility=modelIT*c.modelPUE, gateFacility=gateIT*c.gatePUE;
    const onSiteFresh=modelIT*c.siteWUE*c.siteFreshFraction+gateIT*c.gateWUE*c.gateFreshFraction;
    const upstreamFresh=modelFacility*c.gridFreshLPerKWh+gateFacility*c.gateGridFreshLPerKWh;
    const modelSeconds=executions*c.modelSeconds*(c.fixedTimeShare+(1-c.fixedTimeShare)*tokenFraction);
    const gateSeconds=enabled?attempts*c.gateSeconds:0;
    const humanMinutes=executions*c.humanMinutesPerExecution*(enabled?1-c.humanReviewReduction:1)+(enabled?attempts*c.humanMinutesPerGate:0);
    const modelCost=executions*c.modelCost*(c.fixedCostShare+(1-c.fixedCostShare)*tokenFraction);
    const witnessCost=enabled?attempts*c.paidWitnessesPerAttempt*c.witnessPrice:0;
    const gateCost=enabled?attempts*c.gateCost:0;
    const humanCost=humanMinutes*c.humanDollarsPerHour/60;
    const perSubmission={tokens:executions*c.tokens*tokenFraction,
      facilityKWh:modelFacility+gateFacility, modelFacilityKWh:modelFacility,gateFacilityKWh:gateFacility,
      onSiteFreshL:onSiteFresh,upstreamFreshL:upstreamFresh,freshL:onSiteFresh+upstreamFresh,
      machineSeconds:modelSeconds+gateSeconds,humanMinutes,
      dollars:modelCost+witnessCost+gateCost+humanCost,modelDollars:modelCost,witnessDollars:witnessCost,
      humanDollars:humanCost, heatEquivalentMJ:(modelFacility+gateFacility)*3.6};
    const perCompletion=Object.fromEntries(Object.entries(perSubmission).map(([k,v])=>[k,divide(v,completion)]));
    const submissions=c.submissions*(enabled?c.demandMultiplier:1);
    const total=Object.fromEntries(Object.entries(perSubmission).map(([k,v])=>[k,v*submissions]));
    return {attempts,executions,completion,submissions,completed:submissions*completion,perSubmission,perCompletion,total};
  }
  function compare(input={}) {
    const config=parameters(input), baseline=run(config,false), protocol=run(config,true);
    const savingsPct={},totalChangePct={},breakEvenDemand={};
    for(const key of Object.keys(baseline.perSubmission)) {
      const b=baseline.perCompletion[key],p=protocol.perCompletion[key];
      savingsPct[key]=b!==null&&b>0&&p!==null?100*(1-p/b):null;
      totalChangePct[key]=baseline.total[key]>0?100*(protocol.total[key]/baseline.total[key]-1):null;
      breakEvenDemand[key]=divide(baseline.perSubmission[key],protocol.perSubmission[key]);
    }
    const zero=run({...config,gateEnergyRatio:0},true);
    const gateFreshPerKWh=config.gateWUE*config.gateFreshFraction+config.gatePUE*config.gateGridFreshLPerKWh;
    const gateFreshPerCompletion=divide(zero.attempts*config.modelITkWh*gateFreshPerKWh,zero.completion);
    const overheadBreakEvenForFreshwater=gateFreshPerCompletion>0?
      (baseline.perCompletion.freshL-zero.perCompletion.freshL)/gateFreshPerCompletion:null;
    return {config,baseline,protocol,savingsPct,totalChangePct,breakEvenDemand,overheadBreakEvenForFreshwater};
  }
  const api={defaults,compare};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.PopcornWaterModel=api;
})(globalThis);
