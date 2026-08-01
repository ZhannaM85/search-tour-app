export type HotelNote = {
  id: string;
  hotelId: number | null;
  name: string;
  pageUrl: string;
  latitude: number;
  longitude: number;
  priceOneRoom: string;
  priceTwoRooms: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ParsedTourCurl = {
  requestUrl: string;
  hotelId: number | null;
  name: string;
  pageUrl: string;
  latitude: number;
  longitude: number;
  refererUrl: string;
};
