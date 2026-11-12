// Spike for forever-sim Phase 0: build a RaidSimRequest from an upstream preset,
// attach the per-player SimDatabase subset the browser UI would send, and write
// it as binary proto + protojson.
package main

import (
	"fmt"
	"os"

	"github.com/wowsims/forever/assets/database"
	"github.com/wowsims/forever/cmd/wowsimcli/cmd"
	"github.com/wowsims/forever/sim"
	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/proto"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

func main() {
	sim.RegisterAll()
	in, out := os.Args[1], os.Args[2]
	req, warnings, err := cmd.SpikeRequest(in)
	if err != nil {
		panic(err)
	}
	for _, w := range warnings {
		fmt.Fprintln(os.Stderr, "warning:", w)
	}
	req.SimOptions.Iterations = 5000
	req.SimOptions.RandomSeed = 0x5F1A
	req.SimOptions.SaveAllValues = true
	req.SimOptions.DebugFirstIteration = true

	db := database.Load()
	for _, party := range req.Raid.Parties {
		for _, p := range party.Players {
			if p == nil || p.Equipment == nil {
				continue
			}
			p.Database = subset(db, p.Equipment)
		}
	}
	if len(os.Args) > 3 {
		p := req.Raid.Parties[0].Players[0]
		swr := &proto.StatWeightsRequest{Player: p, RaidBuffs: req.Raid.Buffs, PartyBuffs: req.Raid.Parties[0].Buffs, Debuffs: req.Raid.Debuffs,
			Encounter: req.Encounter, SimOptions: &proto.SimOptions{Iterations: 2000, RandomSeed: 0x5F1A},
			StatsToWeigh: []proto.Stat{proto.Stat_StatStrength, proto.Stat_StatAgility, proto.Stat_StatAttackPower, proto.Stat_StatRangedAttackPower},
			EpReferenceStat: proto.Stat_StatRangedAttackPower, HpsReferenceStat: proto.Stat_StatRangedAttackPower}
		b, _ := googleProto.Marshal(swr)
		j, _ := protojson.MarshalOptions{Multiline: true}.Marshal(swr)
		os.WriteFile(os.Args[3]+"-request.bin", b, 0o644)
		os.WriteFile(os.Args[3]+"-request.json", j, 0o644)
		res := core.StatWeights(swr)
		rj, _ := protojson.MarshalOptions{Multiline: true}.Marshal(res)
		rb, _ := googleProto.Marshal(res)
		os.WriteFile(os.Args[3]+"-result.json", rj, 0o644)
		os.WriteFile(os.Args[3]+"-result.bin", rb, 0o644)
		fmt.Fprintln(os.Stderr, "stat weights done")
	}
	bin, _ := googleProto.Marshal(req)
	js, _ := protojson.MarshalOptions{Multiline: true}.Marshal(req)
	os.WriteFile(out+".bin", bin, 0o644)
	os.WriteFile(out+".json", js, 0o644)
	fmt.Fprintf(os.Stderr, "wrote %d bytes bin, %d bytes json\n", len(bin), len(js))
}

func subset(db *proto.UIDatabase, eq *proto.EquipmentSpec) *proto.SimDatabase {
	items, enchants, suffixes := map[int32]bool{}, map[int32]bool{}, map[int32]bool{}
	for _, it := range eq.Items {
		if it == nil {
			continue
		}
		items[it.Id] = true
		enchants[it.Enchant] = true
		suffixes[it.RandomSuffix] = true
	}
	out := &proto.SimDatabase{}
	for _, item := range db.Items {
		if !items[item.Id] {
			continue
		}
		out.Items = append(out.Items, &proto.SimItem{Id: item.Id, Name: item.Name, Type: item.Type, ArmorType: item.ArmorType,
			WeaponType: item.WeaponType, HandType: item.HandType, RangedWeaponType: item.RangedWeaponType, PseudoStats: item.PseudoStats,
			WeaponSpeed: item.WeaponSpeed, QualityModifier: item.QualityModifier, SpellSchool: item.SpellSchool, Unique: item.Unique,
			LimitCategory: item.LimitCategory, SetName: item.SetName, SetId: item.SetId, ClassAllowlist: item.ClassAllowlist,
			ScalingOptions: item.ScalingOptions, ItemEffects: item.ItemEffects})
	}
	for _, e := range db.Enchants {
		if enchants[e.EffectId] {
			out.Enchants = append(out.Enchants, &proto.SimEnchant{EffectId: e.EffectId, Stats: e.Stats, PseudoStats: e.PseudoStats,
				WeaponDamage: e.WeaponDamage, EnchantEffects: e.EnchantEffects, Name: e.Name, Type: e.Type, EnchantType: e.EnchantType,
				ExtraTypes: e.ExtraTypes, ProcKind: e.ProcKind})
		}
	}
	for _, s := range db.RandomSuffixes {
		if suffixes[s.Id] {
			out.RandomSuffixes = append(out.RandomSuffixes, &proto.ItemRandomSuffix{Id: s.Id, Name: s.Name, Stats: s.Stats, PseudoStats: s.PseudoStats})
		}
	}
	for _, r := range db.ItemEffectRandPropPoints {
		out.ItemEffectRandPropPoints = append(out.ItemEffectRandPropPoints, &proto.ItemEffectRandPropPoints{Ilvl: r.Ilvl, RandPropPoints: r.RandPropPoints})
	}
	// Phase 0: send every consumable and spell effect; the real client sends only what the player uses.
	out.Consumables = db.Consumables
	out.SpellEffects = db.SpellEffects
	return out
}
