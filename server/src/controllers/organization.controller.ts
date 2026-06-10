import { Request, Response } from 'express';
import { Organization } from '../models/Organization';
import type { TokenPayload } from '../utils/token';

export const getLocations = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    const org = await Organization.findById(user.orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    return res.json({ locations: org.locations || [] });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const addLocation = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only admins can manage locations' });
    }

    const { name, address, lat, lng, radius } = req.body;
    if (!name || lat === undefined || lng === undefined || radius === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const org = await Organization.findById(user.orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    if (!org.locations) org.locations = [];
    org.locations.push({ name, address, lat, lng, radius });
    await org.save();

    return res.status(201).json({ location: org.locations[org.locations.length - 1] });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteLocation = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only admins can manage locations' });
    }

    const { id } = req.params;
    const org = await Organization.findById(user.orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    org.locations = org.locations.filter((loc: any) => loc._id.toString() !== id);
    await org.save();

    return res.json({ message: 'Location deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateLocation = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only admins can manage locations' });
    }

    const { id } = req.params;
    const { name, address, lat, lng, radius } = req.body;
    
    const org = await Organization.findById(user.orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const locationIndex = org.locations.findIndex((loc: any) => loc._id.toString() === id);
    if (locationIndex === -1) {
      return res.status(404).json({ message: 'Location not found' });
    }

    org.locations[locationIndex] = {
      ...org.locations[locationIndex],
      name: name || org.locations[locationIndex].name,
      address: address !== undefined ? address : org.locations[locationIndex].address,
      lat: lat !== undefined ? lat : org.locations[locationIndex].lat,
      lng: lng !== undefined ? lng : org.locations[locationIndex].lng,
      radius: radius !== undefined ? radius : org.locations[locationIndex].radius,
    };

    await org.save();
    return res.json({ location: org.locations[locationIndex] });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
