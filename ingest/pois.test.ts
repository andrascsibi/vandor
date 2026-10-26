import { describe, it, expect } from "vitest";
import { BUDA_HILLS_BBOX } from "./overpass.ts";
import {
  buildPoiQuery,
  classifyHospitality,
  poisToGeoJson,
  type OverpassPoiResponse,
} from "./pois.ts";

describe("buildPoiQuery", () => {
  const query = buildPoiQuery(BUDA_HILLS_BBOX);

  it("unions the POI selectors and asks for center coordinates", () => {
    expect(query).toContain("[out:json]");
    expect(query).toContain('node["natural"="peak"]');
    expect(query).toContain('node["natural"="saddle"]');
    expect(query).toContain('node["natural"="spring"]');
    expect(query).toContain('node["tourism"="viewpoint"]');
    expect(query).toContain('node["amenity"="shelter"]');
    expect(query).toContain('node["highway"="bus_stop"]');
    expect(query).toContain("out center;");
  });

  it("queries ways too for area-mapped amenities (shelter, parking)", () => {
    expect(query).toContain('way["amenity"="shelter"]');
    expect(query).toContain('way["amenity"="parking"]');
  });

  it("unions the hospitality selectors too (T12b kultúrista overlay)", () => {
    expect(query).toContain('node["amenity"="restaurant"]');
    expect(query).toContain('node["amenity"="cafe"]');
    expect(query).toContain('node["amenity"="fast_food"]');
    expect(query).toContain('node["amenity"="pub"]');
    expect(query).toContain('node["amenity"="bar"]');
    expect(query).toContain('node["amenity"="biergarten"]');
    expect(query).toContain('node["tourism"="picnic_site"]');
    // restaurants/biergartens are often mapped as areas → ways with `out center`.
    expect(query).toContain('way["amenity"="restaurant"]');
  });
});

describe("classifyHospitality", () => {
  it("maps eat-out amenities to food", () => {
    expect(classifyHospitality({ amenity: "restaurant" })).toBe("food");
    expect(classifyHospitality({ amenity: "fast_food" })).toBe("food");
  });

  it("maps drink-led amenities to drink", () => {
    expect(classifyHospitality({ amenity: "cafe" })).toBe("drink");
    expect(classifyHospitality({ amenity: "pub" })).toBe("drink");
    expect(classifyHospitality({ amenity: "bar" })).toBe("drink");
    expect(classifyHospitality({ amenity: "biergarten" })).toBe("drink");
  });

  it("maps picnic sites to picnic", () => {
    expect(classifyHospitality({ tourism: "picnic_site" })).toBe("picnic");
  });

  it("returns undefined for non-hospitality tags", () => {
    expect(classifyHospitality({ natural: "peak" })).toBeUndefined();
    expect(classifyHospitality({ amenity: "parking" })).toBeUndefined();
    expect(classifyHospitality({})).toBeUndefined();
  });
});

describe("poisToGeoJson", () => {
  const sample: OverpassPoiResponse = {
    elements: [
      {
        type: "node",
        id: 1,
        lat: 47.52,
        lon: 18.96,
        tags: { natural: "peak", name: "János-hegy", ele: "527" },
      },
      {
        type: "node",
        id: 2,
        lat: 47.53,
        lon: 18.97,
        tags: { tourism: "viewpoint", name: "Erzsébet-kilátó" },
      },
      // a parking area mapped as a way → located by its center
      {
        type: "way",
        id: 3,
        center: { lat: 47.54, lon: 18.98 },
        tags: { amenity: "parking", name: "Normafa P", access: "yes" },
      },
      // untagged / unclassifiable → dropped
      { type: "node", id: 4, lat: 47.55, lon: 18.99, tags: { man_made: "mast" } },
      // classifiable but no location → dropped
      { type: "way", id: 5, tags: { amenity: "shelter" } },
    ],
  };
  const fc = poisToGeoJson(sample);

  it("keeps only classifiable, locatable POIs", () => {
    expect(fc.features.map((f) => f.id).sort()).toEqual([1, 2, 3]);
  });

  it("classifies kind and emits [lon, lat] Point coordinates", () => {
    const peak = fc.features.find((f) => f.id === 1)!;
    expect(peak.properties.kind).toBe("peak");
    expect(peak.geometry.coordinates).toEqual([18.96, 47.52]);
    expect(peak.properties.name).toBe("János-hegy");
    expect(peak.properties.ele).toBe(527);
  });

  it("locates way POIs by their center and records the osm type + access", () => {
    const parking = fc.features.find((f) => f.id === 3)!;
    expect(parking.properties.kind).toBe("parking");
    expect(parking.properties.osmType).toBe("way");
    expect(parking.geometry.coordinates).toEqual([18.98, 47.54]);
    expect(parking.properties.access).toBe("yes");
  });

  it("classifies hospitality POIs into food/drink/picnic kinds", () => {
    const hosp = poisToGeoJson({
      elements: [
        { type: "node", id: 10, lat: 47.5, lon: 18.9, tags: { amenity: "restaurant", name: "Nagyrét Büfé" } },
        { type: "node", id: 11, lat: 47.5, lon: 18.9, tags: { amenity: "cafe" } },
        { type: "way", id: 12, center: { lat: 47.5, lon: 18.9 }, tags: { amenity: "biergarten", name: "Sörkert" } },
        { type: "node", id: 13, lat: 47.5, lon: 18.9, tags: { tourism: "picnic_site" } },
      ],
    });
    const byId = new Map(hosp.features.map((f) => [f.id, f.properties.kind]));
    expect(byId.get(10)).toBe("food");
    expect(byId.get(11)).toBe("drink");
    expect(byId.get(12)).toBe("drink");
    expect(byId.get(13)).toBe("picnic");
  });
});
