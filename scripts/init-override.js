Hooks.once("init", () => {
  console.log("DC20 Individual Initiative | Initializing custom combat overrides...");

  game.settings.register("dc20-individual-initiative", "rerollEachRound", {
    name: "Reroll Initiative Each Round",
    hint: "Automatically rerolls initiative for all combatants at the start of a new round without requiring manual input.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  CONFIG.ui.combat = CombatTracker;

  CONFIG.Combat.initiative = {
    formula: "1d20 + @attributes.agility.value + @details.combatMastery",
    decimals: 0
  };
});

/**
 * Safely extracts Agility modifier from DC20 Actor schema
 */
function getAgilityModifier(actor) {
  if (!actor?.system) return 0;
  const sys = actor.system;
  const rollData = actor.getRollData ? actor.getRollData() : {};

  let val = sys.attributes?.agility?.value 
         ?? sys.attributes?.agi?.value
         ?? sys.primaries?.agility?.value
         ?? sys.primaries?.agi?.value
         ?? sys.attributes?.agility
         ?? sys.attributes?.agi
         ?? rollData.attributes?.agility?.value
         ?? rollData.attributes?.agi?.value
         ?? rollData.agility
         ?? rollData.agi
         ?? 0;

  if (typeof val === "object" && val !== null) {
    val = val.value ?? val.mod ?? val.current ?? 0;
  }

  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

/**
 * Safely extracts Combat Mastery from DC20 Actor schema
 */
function getCombatMastery(actor) {
  if (!actor?.system) return 0;
  const sys = actor.system;
  const rollData = actor.getRollData ? actor.getRollData() : {};

  let cm = sys.details?.combatMastery 
        ?? sys.combatMastery 
        ?? sys.details?.cm
        ?? rollData.details?.combatMastery
        ?? rollData.combatMastery
        ?? rollData.cm;

  if (cm === undefined || cm === null || isNaN(Number(cm))) {
    const level = sys.details?.level ?? sys.level ?? rollData.level ?? 1;
    cm = Math.ceil(Number(level) / 2);
  }

  const num = Number(cm);
  return isNaN(num) ? 0 : num;
}

/**
 * Safely extracts Initiative bonus/penalty from DC20 Actor schema or Active Effects / DRM
 */
function getInitiativeBonus(actor) {
  if (!actor?.system) return 0;
  const sys = actor.system;
  const rollData = actor.getRollData ? actor.getRollData() : {};

  let bonus = sys.attributes?.init?.bonus 
           ?? sys.attributes?.initiative?.bonus
           ?? sys.attributes?.init?.otherMod
           ?? sys.bonuses?.init
           ?? sys.init?.bonus
           ?? rollData.attributes?.init?.bonus
           ?? rollData.attributes?.initiative?.bonus
           ?? rollData.bonuses?.init
           ?? 0;

  if (typeof bonus === "object" && bonus !== null) {
    bonus = bonus.value ?? bonus.mod ?? bonus.current ?? 0;
  }

  // Check Active Effects / DRM changes for numeric bonuses
  const effects = [...(actor.effects || []), ...(actor.appliedEffects || [])];
  for (const effect of effects) {
    if (effect.disabled || effect.isSuppressed) continue;
    for (const change of effect.changes || []) {
      const key = (change.key || "").toLowerCase();
      if (key.includes("init") || key.includes("drm") || key.includes("initiative")) {
        let val = change.value;
        if (typeof val === "object" && val !== null) {
          const num = Number(val.value ?? val.mod ?? val.bonus ?? 0);
          if (!isNaN(num) && num !== 0) bonus += num;
        } else if (typeof val === "string") {
          try {
            if (val.trim().startsWith("{")) {
              const obj = JSON.parse(val);
              const num = Number(obj.value ?? obj.mod ?? obj.bonus ?? 0);
              if (!isNaN(num) && num !== 0) bonus += num;
            } else {
              const num = Number(val);
              if (!isNaN(num) && num !== 0) bonus += num;
            }
          } catch (e) {
            const num = Number(val);
            if (!isNaN(num) && num !== 0) bonus += num;
          }
        } else if (typeof val === "number") {
          bonus += val;
        }
      }
    }
  }

  const num = Number(bonus);
  return isNaN(num) ? 0 : num;
}

/**
 * Safely checks Initiative advantage/disadvantage from DC20 Actor schema, Active Effects, and DRM structures
 */
function getInitiativeAdvantageState(actor) {
  if (!actor?.system) return { advantage: false, disadvantage: false };
  const sys = actor.system;
  const rollData = actor.getRollData ? actor.getRollData() : {};

  let adv = sys.attributes?.init?.advantage 
         ?? sys.attributes?.initiative?.advantage
         ?? sys.bonuses?.init?.advantage
         ?? sys.init?.advantage
         ?? rollData.attributes?.init?.advantage
         ?? rollData.initiative?.advantage
         ?? false;

  let dis = sys.attributes?.init?.disadvantage 
         ?? sys.attributes?.initiative?.disadvantage
         ?? sys.bonuses?.init?.disadvantage
         ?? sys.init?.disadvantage
         ?? rollData.attributes?.init?.disadvantage
         ?? rollData.initiative?.disadvantage
         ?? false;

  // Check active effects and DRM changes (e.g., {"value": 1, "type": "adv", "label": "Fast Reflexes"})
  const effects = [...(actor.effects || []), ...(actor.appliedEffects || [])];
  for (const effect of effects) {
    if (effect.disabled || effect.isSuppressed) continue;

    const effectName = (effect.label || effect.name || "").toLowerCase();
    if (effectName.includes("fast reflexes") || effectName.includes("initiative") || effectName.includes("init")) {
      // If effect name/label matches initiative traits
    }

    for (const change of effect.changes || []) {
      const key = (change.key || "").toLowerCase();
      const val = change.value;

      if (key.includes("init") || key.includes("drm") || key.includes("initiative")) {
        let valObj = null;
        let valStr = "";

        if (typeof val === "object" && val !== null) {
          valObj = val;
          valStr = JSON.stringify(val).toLowerCase();
        } else if (typeof val === "string") {
          valStr = val.toLowerCase();
          try {
            if (val.trim().startsWith("{") || val.trim().startsWith("[")) {
              valObj = JSON.parse(val);
            }
          } catch (e) {}
        }

        if (valObj) {
          const typeVal = String(valObj.type || valObj.advantage || valObj.mod || "").toLowerCase();
          if (typeVal === "adv" || typeVal === "advantage" || typeVal === "1" || valObj.advantage === true) {
            adv = true;
          }
          if (typeVal === "dis" || typeVal === "disadvantage" || typeVal === "-1" || valObj.disadvantage === true) {
            dis = true;
          }
        }

        if (valStr.includes("adv") || valStr.includes("advantage")) {
          if (!valStr.includes("disadvantage") && !valStr.includes("dis")) {
            adv = true;
          }
        }
        if (valStr.includes("dis") || valStr.includes("disadvantage")) {
          dis = true;
        }
      }
    }
  }

  // Check system DRM maps if present
  if (sys.drm || rollData.drm) {
    const drm = sys.drm || rollData.drm;
    const initDrm = drm.initiative || drm.init || drm["Initiative Check"] || drm["initiative check"];
    if (initDrm) {
      if (typeof initDrm === "object") {
        const t = String(initDrm.type || initDrm.advantage || "").toLowerCase();
        if (t === "adv" || t === "advantage") adv = true;
        if (t === "dis" || t === "disadvantage") dis = true;
      }
    }
  }

  return { advantage: Boolean(adv), disadvantage: Boolean(dis) };
}

/**
 * Strictly determines if a combatant is a companion/summon
 */
function isCompanionType(combatant) {
  if (!combatant?.actor) return false;
  const actor = combatant.actor;

  if (actor.type === "character" && !actor.system?.isCompanion && !actor.flags?.dc20rpg?.isCompanion) {
    return false;
  }

  if (actor.type === "companion" || actor.system?.isCompanion || actor.flags?.dc20rpg?.isCompanion) {
    return true;
  }

  if (actor.hasPlayerOwner && actor.type !== "character" && !combatant.isNPC && actor.type !== "npc") {
    return true;
  }

  const name = (combatant.name || actor.name || "").toLowerCase();
  const companionKeywords = ["summon", "companion", "familiar", "pet", "fiend", "celestial", "minion", "servant", "elemental", "drake", "spirit", "construct"];
  
  if (companionKeywords.some(kw => name.includes(kw))) {
    return true;
  }

  if (/\(.*?\)/.test(name) || /['’]s\b/.test(name)) {
    return true;
  }

  return false;
}

function applyCombatOverrides() {
  if (game.system.id !== "dc20rpg") return;

  const CombatClass = CONFIG.Combat.documentClass;

  CombatClass.prototype._sortCombatants = function(a, b) {
    const initA = Number.isNumeric(a.initiative) ? a.initiative : -9999;
    const initB = Number.isNumeric(b.initiative) ? b.initiative : -9999;
    if (initA !== initB) return initB - initA;
    return a.id.localeCompare(b.id);
  };

  CombatClass.prototype.startCombat = async function() {
    const unrolledIds = this.combatants
      .filter(c => c.initiative === null || c.initiative === undefined)
      .map(c => c.id);

    if (unrolledIds.length > 0) {
      await this.rollInitiative(unrolledIds);
    }

    this.setupTurns();
    return this.update({ round: 1, turn: 0 });
  };

  CombatClass.prototype.rollInitiative = async function(ids, options = {}) {
    let combatantIds = typeof ids === "string" ? [ids] : [...ids];

    // Ensure companions of rolling characters are included
    for (const id of [...combatantIds]) {
      const combatant = this.combatants.get(id);
      if (!combatant) continue;

      const companions = this.combatants.filter(c => {
        const master = findMasterCombatant(this, c);
        return master && master.id === combatant.id;
      });

      for (const companion of companions) {
        if (!combatantIds.includes(companion.id)) {
          combatantIds.push(companion.id);
        }
      }
    }

    const allCombatants = combatantIds.map(id => this.combatants.get(id)).filter(Boolean);
    const regularCombatants = [];
    const companionCombatants = [];

    for (const c of allCombatants) {
      if (isCompanionType(c) && findMasterCombatant(this, c)) {
        companionCombatants.push(c);
      } else {
        regularCombatants.push(c);
      }
    }

    const updates = [];
    const messages = [];
    const masterInitiativeMap = new Map();

    // PASS 1: Roll Regular Characters & NPCs
    for (const combatant of regularCombatants) {
      if (!combatant.actor) continue;
      const actor = combatant.actor;

      const agilityMod = getAgilityModifier(actor);
      const cm = getCombatMastery(actor);
      const initBonus = getInitiativeBonus(actor);
      const advState = getInitiativeAdvantageState(actor);

      let diceExpr = "1d20";
      let advLabel = "";
      if (advState.advantage && !advState.disadvantage) {
        diceExpr = "2d20kh1";
        advLabel = " (Advantage)";
      } else if (advState.disadvantage && !advState.advantage) {
        diceExpr = "2d20kl1";
        advLabel = " (Disadvantage)";
      }

      const rollFormula = `${diceExpr} + ${agilityMod} + ${cm} + ${initBonus}`;
      const roll = await new Roll(rollFormula, actor.getRollData()).evaluate();

      const baseInit = Math.round(roll.total);
      masterInitiativeMap.set(combatant.id, baseInit);

      const bonusStr = initBonus !== 0 ? ` + ${initBonus} Init` : "";
      const messageData = foundry.utils.mergeObject({
        speaker: ChatMessage.getSpeaker({ actor, token: combatant.token, alias: combatant.name }),
        flavor: `${combatant.name} rolls Initiative!${advLabel} (1d20 + ${agilityMod} AGI + ${cm} CM${bonusStr})`,
        flags: { "core.initiativeRoll": true }
      }, options.messageOptions || {});

      const chatMessage = await roll.toMessage(messageData, { create: false });
      messages.push(chatMessage);
    }

    // Sort regular combatants to break ties cleanly between masters
    regularCombatants.sort((a, b) => {
      const initA = masterInitiativeMap.get(a.id);
      const initB = masterInitiativeMap.get(b.id);
      if (initA !== initB) return initB - initA;
      return a.id.localeCompare(b.id);
    });

    const baseValueGroups = new Map();
    for (const c of regularCombatants) {
      const val = masterInitiativeMap.get(c.id);
      if (!baseValueGroups.has(val)) baseValueGroups.set(val, []);
      baseValueGroups.get(val).push(c);
    }

    for (const [baseVal, group] of baseValueGroups.entries()) {
      group.forEach((combatant, rankIndex) => {
        const microAdjustedInit = Math.round((baseVal - (rankIndex * 0.0010)) * 10000) / 10000;
        masterInitiativeMap.set(combatant.id, microAdjustedInit);

        updates.push({
          _id: combatant.id,
          initiative: microAdjustedInit
        });
      });
    }

    if (updates.length) {
      await this.updateEmbeddedDocuments("Combatant", updates);
      updates.length = 0;
    }

    const companionOffsets = new Map();

    // PASS 2: Place companions directly under their respective master internally
    for (const combatant of companionCombatants) {
      if (!combatant.actor) continue;

      const masterCombatant = findMasterCombatant(this, combatant);
      let masterInit = masterCombatant 
        ? (masterInitiativeMap.get(masterCombatant.id) ?? masterCombatant.initiative) 
        : null;

      let initVal;

      if (masterInit !== null && masterInit !== undefined && masterCombatant) {
        const currentOffset = companionOffsets.get(masterCombatant.id) || 1;
        initVal = Math.round((masterInit - (0.0001 * currentOffset)) * 10000) / 10000;
        companionOffsets.set(masterCombatant.id, currentOffset + 1);
      } else {
        const actor = combatant.actor;
        const agilityMod = getAgilityModifier(actor);
        const cm = getCombatMastery(actor);
        const initBonus = getInitiativeBonus(actor);
        const advState = getInitiativeAdvantageState(actor);

        let diceExpr = "1d20";
        if (advState.advantage && !advState.disadvantage) diceExpr = "2d20kh1";
        else if (advState.disadvantage && !advState.advantage) diceExpr = "2d20kl1";

        const rollFormula = `${diceExpr} + ${agilityMod} + ${cm} + ${initBonus}`;
        const roll = await new Roll(rollFormula, actor.getRollData()).evaluate();
        initVal = roll.total;
      }

      updates.push({
        _id: combatant.id,
        initiative: initVal
      });
    }

    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
    if (messages.length) await ChatMessage.create(messages);

    this.setupTurns();
    return this;
  };

  CombatClass.prototype.rollAll = function(options = {}) {
    return this.rollInitiative(this.combatants.map(c => c.id), options);
  };

  CombatClass.prototype.rollNPC = function(options = {}) {
    return this.rollInitiative(this.combatants.filter(c => c.isNPC).map(c => c.id), options);
  };
}

Hooks.once("setup", applyCombatOverrides);
Hooks.once("ready", applyCombatOverrides);

/**
 * Resolves the specific player master combatant for a given companion
 */
function findMasterCombatant(combat, companionCombatant) {
  if (!combat || !companionCombatant) return null;
  if (!isCompanionType(companionCombatant)) return null;

  const actor = companionCombatant.actor;
  const token = companionCombatant.token;

  const pcCombatants = combat.combatants.filter(c => 
    c.id !== companionCombatant.id && 
    (c.actor?.type === "character" || (!c.isNPC && c.actor?.hasPlayerOwner))
  );

  if (pcCombatants.length === 0) return null;

  const moduleMasterId = companionCombatant.getFlag?.("dc20-individual-initiative", "masterId");
  if (moduleMasterId) {
    const master = combat.combatants.get(moduleMasterId);
    if (master) return master;
  }

  const candidateIds = [
    companionCombatant.flags?.dc20rpg?.masterId,
    actor?.flags?.dc20rpg?.masterId,
    actor?.flags?.dc20rpg?.summonerId,
    actor?.flags?.dc20rpg?.sourceActorId,
    actor?.flags?.dc20rpg?.ownerId,
    actor?.system?.details?.companionOwner,
    actor?.system?.companionOwner,
    token?.flags?.dc20rpg?.masterId,
    token?.flags?.dc20rpg?.summonerId,
    token?.flags?.warpgate?.parent
  ].filter(Boolean);

  for (const id of candidateIds) {
    const master = pcCombatants.find(c => 
      c.actor?.id === id || c.id === id || c.tokenId === id || c.token?.id === id
    );
    if (master) return master;
  }

  const namesToSearch = [companionCombatant.name, token?.name, actor?.name].filter(Boolean);

  for (const pc of pcCombatants) {
    const pcFullName = (pc.name || pc.actor?.name || "").trim().toLowerCase();
    const pcFirstName = pcFullName.split(" ")[0];

    for (const nameStr of namesToSearch) {
      const lowerStr = nameStr.toLowerCase();

      const parentMatch = lowerStr.match(/\(([^)]+)\)/);
      if (parentMatch && parentMatch[1]) {
        const inside = parentMatch[1].trim();
        if (inside === pcFullName || inside === pcFirstName) return pc;
      }

      if (lowerStr.startsWith(`${pcFirstName}'s`) || lowerStr.startsWith(`${pcFullName}'s`)) return pc;
      if (lowerStr.includes(`- ${pcFirstName}`) || lowerStr.includes(`- ${pcFullName}`)) return pc;
    }
  }

  if (actor?.ownership) {
    const nonGmOwners = Object.entries(actor.ownership)
      .filter(([userId, level]) => {
        if (level < 3 || userId === "default") return false;
        const user = game.users.get(userId);
        return user && !user.isGM;
      })
      .map(([userId]) => userId);

    if (nonGmOwners.length > 0) {
      const candidatePCs = pcCombatants.filter(c => 
        nonGmOwners.some(userId => c.actor?.ownership?.[userId] === 3)
      );
      if (candidatePCs.length === 1) return candidatePCs[0];
    }
  }

  if (canvas?.ready && (token || companionCombatant.tokenId)) {
    const compTokenObj = canvas.tokens.get(companionCombatant.tokenId) || token;
    if (compTokenObj?.x !== undefined) {
      let closestPC = null;
      let minDistance = Infinity;

      for (const pc of pcCombatants) {
        const pcTokenObj = canvas.tokens.get(pc.tokenId) || pc.token;
        if (pcTokenObj?.x !== undefined) {
          const dist = Math.hypot(compTokenObj.x - pcTokenObj.x, compTokenObj.y - pcTokenObj.y);
          if (dist < minDistance) {
            minDistance = dist;
            closestPC = pc;
          }
        }
      }
      if (closestPC) return closestPC;
    }
  }

  const companionIndex = combat.combatants.filter(c => isCompanionType(c)).indexOf(companionCombatant);
  if (companionIndex !== -1 && pcCombatants[companionIndex]) {
    return pcCombatants[companionIndex];
  }

  return null;
}

Hooks.on("combatRound", async (combat) => {
  if (!game.user.isGM) return;
  if (!game.settings.get("dc20-individual-initiative", "rerollEachRound")) return;

  await combat.rollAll();
  combat.setupTurns();
  await combat.update({ turn: 0 });
});

Hooks.on("renderCombatTracker", (app, html) => {
  const root = html instanceof HTMLElement ? $(html) : html;
  const combat = app.viewed;

  root.find('[data-control="startCombat"]').off("click").on("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (combat) await combat.startCombat();
  });

  if (!combat) return;

  root.find(".combatant").each((i, element) => {
    const combatantId = element.dataset.combatantId;
    const combatant = combat.combatants.get(combatantId);
    if (!combatant) return;

    const master = findMasterCombatant(combat, combatant);
    const $row = $(element);
    const $initContainer = $row.find(".token-initiative");

    // Display rounded integer for regular combatants
    const $initValue = $initContainer.find(".initiative, .initiative-value, span");
    if ($initValue.length && combatant.initiative !== null && combatant.initiative !== undefined) {
      if (!master) {
        $initValue.first().text(Math.floor(combatant.initiative));
      }
    }

    $row.find(".link-master-select").remove();

    if (master) {
      // Hide initiative number completely for companions
      $initValue.first().text("");
      $initContainer.find("a.roll, a[data-control='rollInitiative'], button, .dice-button").remove();

      $row.css({
        "padding-left": "20px",
        "margin-left": "6px",
        "border-left": "2px dashed rgba(255, 255, 255, 0.25)"
      });

      const masterName = master.name;
      const $nameEl = $row.find(".combatant-name, .token-name h4, .token-name");
      if ($nameEl.length) {
        const rawText = $nameEl.first().contents().filter(function() {
          return this.nodeType === 3;
        }).text().trim() || $nameEl.first().text().trim();

        if (rawText && !rawText.includes(`(${masterName})`)) {
          $nameEl.first().text(`${rawText} (${masterName})`);
        }
      }

      if (!$initContainer.find(".linked-summon-icon").length) {
        $initContainer.append(`
          <a class="combatant-control disabled linked-summon-icon" title="Linked to ${masterName}" style="pointer-events: none; opacity: 0.7; font-size: 16px; margin-right: 8px;">
            <i class="fas fa-arrow-up-right-from-square"></i>
          </a>
        `);
      }
    }
  });
});

Hooks.on("preCreateCombatant", (combatant) => {
  combatant.updateSource({ initiative: null });
});